import { readFile, stat as statAsync, writeFile, readdir, access } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import crypto from 'crypto';
import chalk from 'chalk';
import ora from 'ora';
import { MiniSearchEngine } from '../search/minisearch-engine.js';

const colors = {
  primary: chalk.cyan,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  info: chalk.cyan,
  dim: chalk.hex('#606060')
};

class IndexBuilder {
  constructor(options = {}) {
    this.projectsDir = options.projectsDir;
    this.indexPath = options.indexPath || join(process.env.HOME || homedir(), '.claude', 'claude_conversations', 'search-index-v2.json');
    this.logger = options.logger || console;
    
    // Only tracking metadata for display purposes
    this.index = {
      metadata: {
        buildDate: null,
        totalConversations: 0,
        buildDuration: 0
      }
    };
    this.stopWords = new Set([
      'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
      'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
      'to', 'was', 'will', 'with', 'the', 'this', 'but', 'they', 'have'
    ]);
  }

  async buildSearchIndex(conversations, exportDir, progressCallback, forceRebuild = false, _customOptions = {}) {
    const isTestEnv = process.env.NODE_ENV?.includes('test') || process.env.JEST_WORKER_ID || process.env.CI;

    // Skip freshness check in test environments to avoid cross-test contamination
    // In production, check if we can skip rebuilding
    if (!isTestEnv && !forceRebuild) {
      try {
        if (existsSync(this.indexPath)) {
          const indexStat = await statAsync(this.indexPath);
          const indexModTime = indexStat.mtime.getTime();

          // Simple freshness check: if no conversations are newer than the index, skip
          let isIndexFresh = true;
          for (const conv of conversations) {
            const convModTime = conv.modified ? new Date(conv.modified).getTime() : 0;
            if (convModTime > indexModTime) {
              isIndexFresh = false;
              break;
            }
          }

          if (isIndexFresh) {
            console.log(colors.success('\n✅ Search index is up to date, skipping rebuild\n'));
            // Load the index to get accurate counts
            // CRITICAL: Use test-specific indexPath to avoid loading production index in tests
            const miniSearchEngine = new MiniSearchEngine({
              projectsDir: this.projectsDir,
              indexPath: this.indexPath,  // Use the indexPath from this IndexBuilder instance
              exportDir: exportDir
            });
            await miniSearchEngine.loadIndex();
            const stats = miniSearchEngine.getStats();

            return {
              success: true,
              skipped: true,
              documentCount: stats.totalDocuments || conversations.length,
              conversationCount: stats.totalConversations || conversations.length,
              conversationsIndexed: stats.totalConversations || conversations.length,
              buildDuration: 0,
              stats: {
                buildTime: 0,
                indexSize: stats.indexSizeBytes || 0,
                avgDocumentSize: stats.totalDocuments > 0 ? (stats.indexSizeBytes || 0) / stats.totalDocuments : 0
              }
            };
          }
        }
      } catch (error) {
        // If check fails, proceed with rebuild
      }
    }

    if (!isTestEnv) {
      console.log(colors.info('\n🗂️  Preparing search index...\n'));
    }

    const startTime = Date.now();
    // Only create spinner in non-test environments to avoid hanging tests
    const spinner = !isTestEnv ? ora({
      text: 'Reading conversation content...',
      color: 'cyan',
      spinner: 'dots'
    }).start() : null;

    let processed = 0;

    // Process conversations in batches to avoid memory exhaustion
    const BATCH_SIZE = 20; // Process 20 conversations at a time
    const totalBatches = Math.ceil(conversations.length / BATCH_SIZE);

    // Initialize the search engine BEFORE processing to enable batch additions
    if (!isTestEnv) {
      console.log(colors.info('   Initializing search index...'));
    }
    const searchEngine = new MiniSearchEngine({
      projectsDir: this.projectsDir,
      indexPath: this.indexPath,
      exportDir: exportDir
    });
    await searchEngine.buildIndex([]); // Initialize with empty index

    // Step 1: Extract text from conversations in batches
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * BATCH_SIZE;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, conversations.length);
      const batch = conversations.slice(batchStart, batchEnd);

      const processedBatch = [];

      for (const conversation of batch) {
        try {
          const indexEntry = await this.processConversation(conversation, exportDir);
          if (indexEntry) {
            processedBatch.push(indexEntry);
          }

          processed++;
          const percentage = Math.round((processed / conversations.length) * 100);
          if (spinner) {
            spinner.text = `Processing batch ${batchIndex + 1}/${totalBatches}: ${percentage}% (${processed}/${conversations.length})`;
          }

          if (progressCallback) {
            progressCallback({
              processed,
              total: conversations.length,
              percentage,
              currentFile: conversation.project
            });
          }
        } catch (error) {
          console.error(`Error processing ${conversation.project}:`, error.message);
        }
      }

      // Add batch to search index
      if (processedBatch.length > 0) {
        await searchEngine.addBatchToIndex(processedBatch);
      }

      // Force garbage collection if available (requires --expose-gc flag)
      if (global.gc && batchIndex < totalBatches - 1) {
        global.gc();
      }
    }

    if (spinner) {
      spinner.stop();
    }

    // Get final stats from the search engine
    const miniSearchStats = searchEngine.getStats();

    // Update metadata for compatibility
    const buildDuration = (Date.now() - startTime) / 1000;
    this.index.metadata.buildDate = new Date().toISOString();
    this.index.metadata.totalConversations = processed;
    this.index.metadata.buildDuration = buildDuration;
    
    if (!isTestEnv) {
      console.log(colors.success('\n✅ Search index built!'));
      console.log(colors.info(`   Conversations indexed: ${processed}`));
      console.log(colors.info(`   Total documents: ${miniSearchStats.totalDocuments || 0}`));
      console.log(colors.info(`   Build time: ${buildDuration.toFixed(1)}s`));
      console.log(colors.info('   ⚡ Search with fuzzy matching, typo tolerance, and more!'));
    }
    
    // Add pause to let user read the summary (not in tests)
    // Skip this entirely in test environments to avoid blocking
    if (!isTestEnv && process.stdin.isTTY) {
      console.log(colors.dim('\n   Press Enter to continue...'));
      await new Promise(resolve => {
        const timeout = setTimeout(resolve, 100); // Failsafe timeout
        process.stdin.once('data', () => {
          clearTimeout(timeout);
          resolve();
        });
        if (process.stdin.setRawMode) {
          process.stdin.setRawMode(true);
        }
        process.stdin.resume();
      });
      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(false);
      }
    }
    
    return {
      success: true,
      processed,
      documentCount: miniSearchStats.totalDocuments || processed,
      conversationCount: processed,
      duration: buildDuration,
      keywords: miniSearchStats.totalDocuments || 0,
      conversationsIndexed: processed,
      buildDuration,
      stats: {
        buildTime: buildDuration,
        indexSize: miniSearchStats.indexSizeBytes || 0,
        avgDocumentSize: processed > 0 ? (miniSearchStats.indexSizeBytes || 0) / processed : 0
      }
    };
  }

  async processConversation(conversation, exportDir) {
    try {
      // Read the JSONL file
      const content = await readFile(conversation.path, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      
      // Parse messages
      const messages = [];
      const toolsUsed = new Set();
      let wordCount = 0;
      let fullText = '';
      
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          // Look for user or assistant messages (not meta or system messages)
          if ((data.type === 'user' || data.type === 'assistant') && data.message && !data.isMeta) {
            messages.push(data.message);
            
            // Extract text content
            const text = this.extractTextFromMessage(data.message);
            fullText += ' ' + text;
            wordCount += text.split(/\s+/).length;
            
            // Track tools used
            if (Array.isArray(data.message.content)) {
              for (const part of data.message.content) {
                if (part.type === 'tool_use' && part.name) {
                  toolsUsed.add(part.name);
                }
              }
            }
          }
        } catch (err) {
          // Skip invalid JSON lines
        }
      }
      
      if (messages.length === 0) {
        return null;
      }
      
      // Extract ALL unique words for complete indexing
      const allWords = fullText.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 1); // Index even 2-letter words
      
      // Get unique words for this conversation
      const uniqueWords = [...new Set(allWords)];
      
      // Keep keyword extraction for relevance scoring
      const keywords = this.extractKeywords(fullText);
      const keywordFrequency = this.calculateKeywordFrequency(fullText);
      
      // Generate content hash for change detection
      const contentHash = crypto.createHash('sha256').update(content).digest('hex');
      
      // Create preview (first 200 chars of meaningful content)
      const preview = fullText.slice(0, 200).trim() + '...';
      
      // Determine export file name - MUST match bulk extractor naming!
      // Bulk extractor uses: ${projectName}_${sessionId}.md
      // Extract session ID from the JSONL filename (it's the UUID part)
      const sessionId = conversation.file ? conversation.file.replace('.jsonl', '') : 'unknown';

      // Clean project name (remove -Users-nathan-norman- prefix if present)
      let projectName = conversation.project.replace(/[^a-zA-Z0-9-_]/g, '_');
      projectName = projectName.replace(/^-?Users-[^-]+-[^-]+-/, '').replace(/^-/, '') || 'home';

      const exportedFile = `${projectName}_${sessionId}.md`;
      
      return {
        id: `conv_${crypto.randomBytes(8).toString('hex')}`,
        project: conversation.project,
        exportedFile: join(exportDir, exportedFile),
        originalPath: conversation.path,
        modified: conversation.modified,
        wordCount,
        messageCount: messages.length,
        contentHash,
        extractedKeywords: keywords,
        keywordFrequency,
        topicTags: this.inferTopics(keywords, toolsUsed),
        preview,
        speakers: [...new Set(messages.map(m => m.role))],
        toolsUsed: Array.from(toolsUsed),
        allWords: uniqueWords,  // Store ALL unique words for complete search
        fullText: fullText  // Pass the full text to MiniSearch so it doesn't need to re-read files
      };
    } catch (error) {
      console.error(`Error processing conversation ${conversation.project}:`, error);
      return null;
    }
  }

  extractTextFromMessage(message) {
    let text = '';
    
    if (typeof message.content === 'string') {
      text = message.content;
    } else if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (typeof part === 'string') {
          text += ' ' + part;
        } else if (part.type === 'text' && part.text) {
          text += ' ' + part.text;
        }
      }
    }
    
    return text.toLowerCase();
  }

  extractKeywords(text) {
    // Simple keyword extraction - get meaningful words
    const words = text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !this.stopWords.has(word));
    
    // Count frequency
    const frequency = {};
    for (const word of words) {
      frequency[word] = (frequency[word] || 0) + 1;
    }
    
    // Get top keywords
    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word]) => word);
  }

  calculateKeywordFrequency(text) {
    const words = text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !this.stopWords.has(word));
    
    const frequency = {};
    for (const word of words) {
      frequency[word] = (frequency[word] || 0) + 1;
    }
    
    // Return top 10 with frequencies
    const top = {};
    Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([word, count]) => {
        top[word] = count;
      });
    
    return top;
  }

  inferTopics(keywords, toolsUsed) {
    const topics = new Set();
    
    // Infer based on keywords
    const topicPatterns = {
      'development': ['code', 'function', 'implementation', 'build', 'test', 'debug'],
      'ui': ['interface', 'button', 'screen', 'display', 'menu', 'form'],
      'search': ['search', 'find', 'query', 'index', 'filter', 'match'],
      'data': ['database', 'data', 'table', 'schema', 'query', 'record'],
      'api': ['api', 'endpoint', 'request', 'response', 'http', 'rest'],
      'setup': ['setup', 'config', 'install', 'initialize', 'configure'],
      'export': ['export', 'save', 'output', 'file', 'write', 'generate']
    };
    
    for (const [topic, patterns] of Object.entries(topicPatterns)) {
      if (patterns.some(pattern => keywords.includes(pattern))) {
        topics.add(topic);
      }
    }
    
    // Infer based on tools
    if (toolsUsed.has('Edit') || toolsUsed.has('Write')) {
      topics.add('development');
    }
    if (toolsUsed.has('Bash')) {
      topics.add('automation');
    }
    
    return Array.from(topics).slice(0, 5);
  }

  /**
   * Main build method (alias for buildSearchIndex)
   * @param {Array} conversations - Conversations to index
   * @param {Object} options - Build options
   * @returns {Promise<Object>} Build results
   */
  async build(options = {}) {
    // Get conversations from projectsDir if not provided
    const conversations = [];
    
    if (this.projectsDir) {
      // Read JSONL files directly from projectsDir
      const files = await readdir(this.projectsDir);

      for (const file of files) {
        if (file.endsWith('.jsonl')) {
          const filePath = join(this.projectsDir, file);
          const fileStat = await statAsync(filePath);
          
          conversations.push({
            project: file.replace('.jsonl', ''),
            file,
            path: filePath,
            modified: fileStat.mtime,
            size: fileStat.size
          });
        }
      }
    }
    
    const exportDir = options.exportDir || join(process.env.HOME || homedir(), '.claude', 'claude_conversations');
    
    // Build custom indexing options
    const customOptions = {};
    if (options.fields) {
      customOptions.fields = options.fields;
    }
    if (options.storeFields) {
      customOptions.storeFields = options.storeFields;
    }
    if (options.fuzzyMatch !== undefined) {
      customOptions.fuzzyMatch = options.fuzzyMatch;
    }
    
    // Build the index
    const startTime = Date.now();
    const result = await this.buildSearchIndex(
      conversations,
      exportDir,
      options.onProgress,
      options.forceRebuild || false,
      customOptions
    );
    
    const buildTime = Date.now() - startTime;

    // Get index file size
    let indexSize = 0;
    try {
      const stats = await statAsync(this.indexPath);
      indexSize = stats.size;

      // If custom options provided, save them to the index
      if (Object.keys(customOptions).length > 0) {
        const indexContent = await readFile(this.indexPath, 'utf-8');
        const indexData = JSON.parse(indexContent);
        indexData.config = customOptions;
        await writeFile(this.indexPath, JSON.stringify(indexData));
      }
    } catch {
      // Index file doesn't exist yet
    }
    
    return {
      success: true,
      documentCount: result.processed || 0,
      conversationCount: conversations.length,
      stats: {
        buildTime,
        indexSize,
        avgDocumentSize: conversations.length > 0 ? indexSize / conversations.length : 0,
        optimized: true
      }
    };
  }

  /**
   * Update index with new conversations
   * @returns {Promise<Object>} Update results
   */
  async update() {
    // Get all conversations from projectsDir
    const conversations = [];

    if (this.projectsDir) {
      const files = await readdir(this.projectsDir);

      for (const file of files) {
        if (file.endsWith('.jsonl')) {
          const filePath = join(this.projectsDir, file);
          const fileStat = await statAsync(filePath);
          
          conversations.push({
            project: file.replace('.jsonl', ''),
            file,
            path: filePath,
            modified: fileStat.mtime,
            size: fileStat.size
          });
        }
      }
    }
    
    // CRITICAL: Use test-specific indexPath to avoid loading/updating production index in tests
    const miniSearchEngine = new MiniSearchEngine({
      projectsDir: this.projectsDir,
      indexPath: this.indexPath,
      exportDir: join(process.env.HOME || homedir(), '.claude', 'claude_conversations')
    });

    // Load existing index
    const indexLoaded = await miniSearchEngine.loadIndex();
    
    if (!indexLoaded) {
      // No existing index, build from scratch
      return await this.build();
    }
    
    // Process all conversations
    const exportDir = join(process.env.HOME || homedir(), '.claude', 'claude_conversations');
    const processedConversations = [];
    
    for (const conversation of conversations) {
      const indexEntry = await this.processConversation(conversation, exportDir);
      if (indexEntry) {
        processedConversations.push(indexEntry);
      }
    }
    
    // Update the MiniSearch index
    await miniSearchEngine.updateIndex(processedConversations);
    
    return {
      success: true,
      conversationCount: conversations.length,
      documentCount: processedConversations.length
    };
  }

  /**
   * Validate the search index
   * @returns {Promise<boolean>} True if valid, false otherwise
   */
  async validateIndex() {
    try {
      // First check if file exists
      await access(this.indexPath);

      // Try to read the index file
      const indexContent = await readFile(this.indexPath, 'utf-8');
      const indexData = JSON.parse(indexContent);
      
      // Check for required fields
      if (!indexData.version) {
        return false;
      }
      
      // For MiniSearch, check if miniSearchData exists
      if (!indexData.miniSearchData) {
        return false;
      }
      
      // Check if MiniSearch data has valid structure
      if (typeof indexData.miniSearchData !== 'object') {
        return false;
      }
      
      // Check if stats exist and are valid
      if (!indexData.stats || typeof indexData.stats !== 'object') {
        return false;
      }
      
      // Validate document count exists (can be 0 for empty projects)
      if (typeof indexData.stats.documentCount !== 'number' || indexData.stats.documentCount < 0) {
        return false;
      }
      
      return true;
    } catch (error) {
      // File doesn't exist or is corrupted
      return false;
    }
  }

  /**
   * Optimize the search index
   * @returns {Promise<Object>} Optimization results
   */
  async optimizeIndex() {
    // CRITICAL: Use test-specific indexPath to avoid optimizing production index in tests
    const miniSearchEngine = new MiniSearchEngine({
      projectsDir: this.projectsDir,
      indexPath: this.indexPath
    });

    // Load and optimize
    await miniSearchEngine.loadIndex();
    await miniSearchEngine.optimizeIndex();
    
    const stats = await miniSearchEngine.getStats();
    
    return {
      success: true,
      optimized: true,
      stats: stats
    };
  }

  /**
   * Get build statistics
   * @returns {Promise<Object>} Build statistics
   */
  async getStats() {
    // CRITICAL: Use test-specific indexPath to avoid reading production index stats in tests
    const miniSearchEngine = new MiniSearchEngine({
      projectsDir: this.projectsDir,
      indexPath: this.indexPath
    });
    const stats = await miniSearchEngine.getStats();
    
    return {
      ...stats,
      metadata: this.index.metadata,
      stopWordsCount: this.stopWords.size
    };
  }

  /**
   * Support custom indexing options
   * @param {Object} options - Custom options
   */
  setIndexingOptions(options = {}) {
    if (options.stopWords) {
      this.stopWords = new Set(options.stopWords);
    }
    
    if (options.minWordLength) {
      this.minWordLength = options.minWordLength;
    }
    
    if (options.maxWordLength) {
      this.maxWordLength = options.maxWordLength;
    }
  }
}

export { IndexBuilder };
export default IndexBuilder;
