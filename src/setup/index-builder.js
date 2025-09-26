import { readFile } from 'fs/promises';
import { join } from 'path';
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

export class IndexBuilder {
  constructor() {
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

  async buildSearchIndex(conversations, exportDir, progressCallback) {
    console.log(colors.info('\n🗂️  Preparing search index...\n'));
    
    const startTime = Date.now();
    const spinner = ora({
      text: 'Reading conversation content...',
      color: 'cyan',
      spinner: 'dots'
    }).start();
    
    let processed = 0;
    const processedConversations = [];
    
    // Step 1: Extract text from all conversations
    for (const conversation of conversations) {
      try {
        const indexEntry = await this.processConversation(conversation, exportDir);
        if (indexEntry) {
          processedConversations.push(indexEntry);
        }
        
        processed++;
        const percentage = Math.round((processed / conversations.length) * 100);
        spinner.text = `Processing conversations: ${percentage}% (${processed}/${conversations.length})`;
        
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
    
    spinner.stop();
    
    // Step 2: Build the MiniSearch index from the processed conversations
    console.log(colors.info('   Indexing for fast search...'));
    const miniSearchEngine = new MiniSearchEngine();
    const miniSearchStats = await miniSearchEngine.buildIndex(processedConversations);
    
    // Update metadata for compatibility
    const buildDuration = (Date.now() - startTime) / 1000;
    this.index.metadata.buildDate = new Date().toISOString();
    this.index.metadata.totalConversations = processedConversations.length;
    this.index.metadata.buildDuration = buildDuration;
    
    console.log(colors.success('\n✅ Search index built!'));
    console.log(colors.info(`   Conversations indexed: ${processed}`));
    console.log(colors.info(`   MiniSearch terms: ${miniSearchStats.indexSize}`));
    console.log(colors.info(`   Build time: ${buildDuration.toFixed(1)}s`));
    console.log(colors.info('   ⚡ Search with fuzzy matching, typo tolerance, and more!'));
    
    // Add pause to let user read the summary
    console.log(colors.dim('\n   Press Enter to continue...'));
    await new Promise(resolve => {
      process.stdin.once('data', resolve);
      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(true);
      }
      process.stdin.resume();
    });
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(false);
    }
    
    return {
      processed,
      duration: buildDuration,
      keywords: miniSearchStats.indexSize
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
      
      // Determine export file name
      const timestamp = conversation.modified 
        ? new Date(conversation.modified).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];
      const projectName = conversation.project.replace(/[^a-zA-Z0-9-_]/g, '_');
      const exportedFile = `${projectName}_${timestamp}.md`;
      
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
}

