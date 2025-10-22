import miniSearchPackage from 'minisearch';
const MiniSearch = miniSearchPackage.default || miniSearchPackage;
import { readFile, writeFile, readdir, stat } from 'fs/promises';
import { join, basename, dirname } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import { setImmediate } from 'timers';
import { KeywordExtractor } from './keyword-extractor.js';

export class MiniSearchEngine {
  constructor(options = {}) {
    this.projectsDir = options.projectsDir || join(homedir(), '.claude', 'projects');
    // NEW: Index from exported markdown files, not source JSONL files
    this.exportDir = options.exportDir || join(homedir(), '.claude', 'claude_conversations');
    this.indexPath = options.indexPath || join(homedir(), '.claude', 'claude_conversations', 'search-index-v2.json');
    this.logger = options.logger || this.createDefaultLogger();
    this.miniSearch = null;
    this.index = null; // Expose for tests
    this.conversationData = new Map(); // Store full conversation data
    this.stats = {
      totalDocuments: 0,
      totalConversations: 0,
      indexedAt: null,
      indexSizeBytes: 0
    };
    this.indexLoaded = false;
  }

  createDefaultLogger() {
    return {
      info: (msg) => console.log(msg),
      warn: (msg) => console.warn(msg),
      error: (msg) => console.error(msg),
      debug: (msg) => process.env.DEBUG && console.log('[DEBUG]', msg)
    };
  }

  /**
   * Extract clean display name from directory-based project name
   * Converts: -Users-nathan-norman-toast-analytics → toast-analytics
   * @param {string} dirName - Directory-based project name
   * @returns {string} Clean display name
   */
  getDisplayName(dirName) {
    if (!dirName) return 'Unknown';

    // Remove path-based prefixes using dynamic patterns
    let displayName = dirName;

    // Pattern 1: Remove -Users-<username>- prefix
    // Handle both single-word (user) and two-word (nathan-norman) usernames
    // -Users-user-my-api-project → my-api-project
    // -Users-nathan-norman-toast-analytics → toast-analytics
    if (displayName.match(/^-?Users-/)) {
      const cleaned = displayName.replace(/^-/, '');

      // Try two-word username first (firstname-lastname-project)
      const twoWordMatch = cleaned.match(/^Users-([^-]+)-([^-]+)-(.+)$/);
      if (twoWordMatch && twoWordMatch[3]) {
        // Check if this looks like lastname-project or just project
        // Heuristic: if part 2 + part 3 together look like a single concept, it's single-word username
        const potentialLastname = twoWordMatch[2];
        const potentialProject = twoWordMatch[3];

        // If the "lastname" is common (home, my, the, app, etc.), it's probably part of project name
        if (potentialLastname.match(/^(my|the|app|web|api|test|dev|prod)$/i)) {
          // Single-word username: Users-user-my-api-project
          displayName = `${potentialLastname}-${potentialProject}`;
        } else {
          // Two-word username: Users-nathan-norman-toast-analytics
          displayName = potentialProject;
        }
      } else if (cleaned.match(/^Users-[^-]+-[^-]+$/)) {
        // Just Users-first-last = home
        return '~ (home)';
      } else if (cleaned.match(/^Users-[^-]+$/)) {
        // Just Users-username = home (single-word username)
        return '~ (home)';
      } else {
        // Fallback
        displayName = cleaned.split('-').slice(2).join('-') || '~ (home)';
      }
    }

    // Pattern 2: Remove full home directory path
    const homeDir = join(homedir(), '').replace(/\\/g, '/');
    if (displayName.startsWith(homeDir)) {
      displayName = displayName.substring(homeDir.length);
    }

    // Pattern 3: Remove absolute path prefix /Users/<username>/
    const absPathMatch = displayName.match(/^\/Users\/[^/]+\/(.+)$/);
    if (absPathMatch) {
      displayName = absPathMatch[1];
    }

    // Handle home directory case (just the username)
    if (displayName.match(/^-?Users-[^-]+$/)) {
      displayName = '~ (home)';
    }

    return displayName || dirName; // Fallback to original if nothing matched
  }

  /**
   * Check if a file is a documentation file (not a conversation)
   * @param {string} filename - Name of the file
   * @returns {boolean} True if it's a documentation file
   */
  isDocumentationFile(filename) {
    const docFiles = [
      'README.md',
      'CHANGELOG.md',
      'LICENSE.md',
      'CONTRIBUTING.md',
      'CLAUDE.md',
      'TODO.md',
      'NOTES.md',
      'TESTING.md'
    ];
    return docFiles.some(doc => filename.toUpperCase() === doc.toUpperCase());
  }

  /**
   * Parse exported markdown file to extract conversation content
   * @param {string} markdownPath - Path to markdown file
   * @returns {Object} Parsed conversation data
   */
  async parseMarkdownConversation(markdownPath) {
    const content = await readFile(markdownPath, 'utf-8');
    const lines = content.split('\n');

    const conversation = {
      project: null,
      sessionId: null,
      date: null,
      modified: null,
      messages: [],
      fullText: '',
      wordCount: 0,
      messageCount: 0,
      // Analytics metadata
      userTurns: 0,
      assistantTurns: 0,
      totalTurns: 0,
      toolCount: 0,
      firstTimestamp: null,
      lastTimestamp: null,
      durationMs: 0
    };

    // Extract metadata from header - handle both old and new formats
    for (let i = 0; i < Math.min(20, lines.length); i++) {
      const line = lines[i];

      // Handle title format: # Claude Conversation - ProjectName
      if (line.startsWith('# Claude Conversation -')) {
        conversation.project = line.split('# Claude Conversation -')[1].trim();
      } else if (line.startsWith('# Claude Code Conversation')) {
        // Continue to next line for metadata
        continue;
      }

      // Handle metadata fields (both plain and bold markdown)
      if (line.startsWith('Project:') || line.startsWith('**Project:**')) {
        conversation.project = line.split(/Project:\*?\*?/)[1].trim();
      } else if (line.startsWith('Session ID:') || line.startsWith('**Session ID:**')) {
        conversation.sessionId = line.split(/Session ID:\*?\*?/)[1].trim();
      } else if (line.startsWith('Date:') || line.startsWith('**Date:**')) {
        const dateStr = line.split(/Date:\*?\*?/)[1].trim();
        conversation.date = dateStr;
        try {
          conversation.modified = new Date(dateStr).toISOString();
        } catch {
          conversation.modified = new Date().toISOString();
        }
      } else if (line.startsWith('Messages:') || line.startsWith('**Messages:**')) {
        // Extract actual message count from header
        const messageCountStr = line.split(/Messages:\*?\*?/)[1].trim();
        conversation.messageCount = parseInt(messageCountStr, 10) || 0;
      }
    }

    // If no session ID found, try to extract from filename
    if (!conversation.sessionId) {
      const filenameMatch = basename(markdownPath).match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (filenameMatch) {
        conversation.sessionId = filenameMatch[1];
      }
    }

    // Extract message content (everything between ## headers)
    // Skip code blocks to exclude tool usage, hook output, etc.
    let currentMessage = null;
    let messageContent = '';
    let fullTextContent = ''; // For keywords - excludes code blocks
    const parsedMessages = [];
    let inCodeBlock = false;

    for (const line of lines) {
      // Track code block boundaries
      if (line.startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        // Include in message content but not in fullText (for keywords)
        if (currentMessage) {
          messageContent += line + '\n';
        }
        continue;
      }

      if (line.startsWith('## 👤') || line.startsWith('## 🤖')) {
        // Save previous message if exists
        if (currentMessage && messageContent.trim()) {
          parsedMessages.push({
            speaker: currentMessage,
            content: messageContent.trim()
          });
        }

        // Start new message
        currentMessage = line.includes('👤') ? 'user' : 'assistant';
        messageContent = '';
      } else if (currentMessage && !line.startsWith('---')) {
        // Accumulate message content (includes code blocks)
        messageContent += line + '\n';

        // Only add to fullText if not in code block (for keyword extraction)
        if (!inCodeBlock) {
          fullTextContent += ' ' + line;
        }
      }
    }

    // Save last message
    if (currentMessage && messageContent.trim()) {
      parsedMessages.push({
        speaker: currentMessage,
        content: messageContent.trim()
      });
    }

    conversation.messages = parsedMessages;
    conversation.fullText = fullTextContent.trim();

    // Calculate word count
    conversation.wordCount = conversation.fullText.split(/\s+/).length;

    // Count conversational turns from parsed messages
    // NOTE: messageCount from header is the total JSONL entries
    // totalTurns is the actual user/assistant conversational exchanges
    for (const msg of parsedMessages) {
      if (msg.speaker === 'user') {
        conversation.userTurns++;
      } else if (msg.speaker === 'assistant') {
        conversation.assistantTurns++;
      }
    }
    conversation.totalTurns = conversation.userTurns + conversation.assistantTurns;

    // If messageCount wasn't set from header, use parsed message count
    if (!conversation.messageCount) {
      conversation.messageCount = parsedMessages.length;
    }

    // Set approximate timestamps for archived conversations
    // Markdown files don't have individual message timestamps, only conversation date
    if (conversation.modified) {
      // Use the conversation date as both first and last timestamp
      // This is approximate but better than nothing
      conversation.firstTimestamp = conversation.modified;
      conversation.lastTimestamp = conversation.modified;
      conversation.durationMs = 0; // Can't calculate duration from markdown alone
    }

    return conversation;
  }

  /**
   * Initialize MiniSearch with optimal configuration for our use case
   */
  initializeMiniSearch() {
    this.miniSearch = new MiniSearch({
      // Fields to index for searching
      fields: ['content', 'project', 'keywords', 'toolsUsed', 'preview'],
      
      // Fields to store and return with results
      storeFields: ['project', 'modified', 'wordCount', 'messageCount', 'keywordList'],
      
      // Search configuration
      searchOptions: {
        boost: { 
          project: 3,      // Project name matches are very important
          keywords: 2,     // Keywords are important
          content: 1       // Regular content has normal weight
        },
        fuzzy: 0.2,        // Enable fuzzy matching for typos
        prefix: true,      // Enable prefix search (type-as-you-go)
        combineWith: 'OR'  // Default to OR for multi-term search
      },
      
      // Tokenization - how to split text into searchable terms
      tokenize: (text, _fieldName) => {
        // Custom tokenizer that preserves hyphenated words as both whole and parts
        const tokens = text.toLowerCase()
          .split(/[\s\-_,;:.!?'"()[\]{}]+/)
          .filter(token => token.length > 1);
        
        // Also add hyphenated terms as whole tokens
        const hyphenated = text.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)+/g) || [];
        
        return [...tokens, ...hyphenated];
      },
      
      // Process terms during indexing
      processTerm: (term, _fieldName) => {
        // Remove possessives and plurals for better matching
        return term.replace(/'s$/, '').replace(/s$/, '');
      }
    });
  }

  /**
   * Add a batch of conversations to an existing index (for batched processing)
   */
  async addBatchToIndex(processedConversations) {
    if (!this.miniSearch) {
      this.initializeMiniSearch();
    }

    const documents = [];
    let conversationIndex = this.stats.totalDocuments || 0;

    for (const conv of processedConversations) {
      // Skip empty conversations
      if (!conv.fullText || conv.fullText.trim().length === 0) {
        continue;
      }

      const rawProject = conv.project || 'Unknown';
      const displayProject = this.getDisplayName(rawProject);

      const document = {
        id: conv.id || `conv_${conversationIndex++}`,
        content: conv.fullText || conv.preview || '',
        project: displayProject,
        keywords: (conv.extractedKeywords || []).join(' '),
        toolsUsed: (conv.toolsUsed || []).join(' '),
        preview: conv.preview || '',
        modified: conv.modified || new Date().toISOString(),
        wordCount: conv.wordCount || 0,
        messageCount: conv.messageCount || 0
      };
      documents.push(document);

      // Store conversation data for retrieval (without keeping full text in memory long-term)
      this.conversationData.set(document.id, {
        project: displayProject,
        rawProject: rawProject,
        exportedFile: conv.exportedFile,
        originalPath: conv.originalPath,
        modified: conv.modified,
        wordCount: conv.wordCount,
        messageCount: conv.messageCount,
        preview: conv.preview,
        // Store full text for search, but it will be saved to disk and can be freed from memory
        fullText: conv.fullText || document.content,
        content: conv.fullText || document.content,
        _fullText: conv.fullText || document.content,
        _content: conv.fullText || document.content,

        // Analytics metadata
        firstTimestamp: conv.firstTimestamp || null,
        lastTimestamp: conv.lastTimestamp || null,
        durationMs: conv.durationMs || 0,
        userTurns: conv.userTurns || 0,
        assistantTurns: conv.assistantTurns || 0,
        totalTurns: conv.totalTurns || 0,
        toolCount: conv.toolCount || 0
      });
    }

    // Add documents to the index
    if (documents.length > 0) {
      this.miniSearch.addAll(documents);
    }

    // Update stats
    this.stats.totalDocuments += documents.length;
    this.stats.totalConversations += documents.length;
    this.stats.indexedAt = new Date().toISOString();

    // Save index incrementally to disk (prevents holding everything in memory)
    await this.saveIndex();

    return {
      added: documents.length,
      totalDocuments: this.stats.totalDocuments
    };
  }

  /**
   * Build index from JSONL files in projectsDir
   */
  async buildIndex(processedConversations = null) {
    this.initializeMiniSearch();
    this.conversationData.clear();
    this.index = this.miniSearch; // Expose for tests

    const documents = [];
    let conversationIndex = 0;

    // If processedConversations are provided, use them directly (from IndexBuilder)
    // Note: We check if it's an array, even if empty, to avoid falling through to markdown scanning
    if (processedConversations !== null && processedConversations !== undefined && Array.isArray(processedConversations)) {
      for (const conv of processedConversations) {
        // Skip empty conversations
        if (!conv.fullText || conv.fullText.trim().length === 0) {
          continue;
        }

        const rawProject = conv.project || 'Unknown';
        const displayProject = this.getDisplayName(rawProject);

        const document = {
          id: conv.id || `conv_${conversationIndex++}`,
          content: conv.fullText || conv.preview || '',
          project: displayProject,
          keywords: (conv.extractedKeywords || []).join(' '),
          toolsUsed: (conv.toolsUsed || []).join(' '),
          preview: conv.preview || '',
          modified: conv.modified || new Date().toISOString(),
          wordCount: conv.wordCount || 0,
          messageCount: conv.messageCount || 0
        };
        documents.push(document);

        // Store conversation data for retrieval
        this.conversationData.set(document.id, {
          project: displayProject,
          rawProject: rawProject,
          exportedFile: conv.exportedFile,
          originalPath: conv.originalPath,
          modified: conv.modified,
          wordCount: conv.wordCount,
          messageCount: conv.messageCount,
          preview: conv.preview,
          fullText: conv.fullText || document.content,
          content: conv.fullText || document.content,
          _fullText: conv.fullText || document.content,
          _content: conv.fullText || document.content,

          // Analytics metadata
          firstTimestamp: conv.firstTimestamp || null,
          lastTimestamp: conv.lastTimestamp || null,
          durationMs: conv.durationMs || 0,
          userTurns: conv.userTurns || 0,
          assistantTurns: conv.assistantTurns || 0,
          totalTurns: conv.totalTurns || 0,
          toolCount: conv.toolCount || 0
        });
      }
    } else {
      // NEW: Read from exported markdown files instead of JSONL
      // This ensures index persists even after Claude Code deletes source files
      if (!existsSync(this.exportDir)) {
        this.logger.warn(`Export directory does not exist: ${this.exportDir}`);
        this.stats.totalDocuments = 0;
        this.stats.totalConversations = 0;
        this.stats.indexedAt = new Date().toISOString();
        return this.stats;
      }

      // Find all markdown files in exportDir (both root and subdirectories)
      const markdownFiles = [];
      try {
        const scanDirectory = async (dir, prefix = '') => {
          const entries = await readdir(dir);

          for (const entry of entries) {
            // Skip hidden directories and backup directories
            if (entry.startsWith('.') || entry.startsWith('archive-backup')) {
              continue;
            }

            const fullPath = join(dir, entry);
            const entryStat = await stat(fullPath);

            if (entryStat.isDirectory()) {
              // Skip subdirectories - we only want root level files now
              // All conversations have been consolidated to root
              continue;
            } else if (entry.endsWith('.md') && !this.isDocumentationFile(entry)) {
              markdownFiles.push({
                path: fullPath,
                project: prefix || basename(dirname(fullPath)),
                filename: entry,
                mtime: entryStat.mtime // Use file modification time for accurate timestamps
              });
            }
          }
        };

        await scanDirectory(this.exportDir);

      } catch (error) {
        this.logger.error(`Cannot read export directory: ${error.message}`);
        this.stats.totalDocuments = 0;
        this.stats.totalConversations = 0;
        this.stats.indexedAt = new Date().toISOString();
        return this.stats;
      }

      // Process markdown files instead of JSONL
      for (const file of markdownFiles) {
        const filePath = file.path;
        const _project = file.project;

        try {
          // Parse the markdown conversation
          const conversation = await this.parseMarkdownConversation(filePath);

          if (!conversation || !conversation.fullText.trim()) {
            continue; // Skip empty conversations
          }

          // Create document for indexing from parsed markdown
          const words = conversation.fullText.trim().split(/\s+/);
          const preview = words.slice(0, 35).join(' ');

          // Extract session ID from filename for unique ID
          const sessionIdMatch = file.filename.match(/([a-f0-9]{8})\.md$/);
          const sessionId = sessionIdMatch ? sessionIdMatch[1] : conversationIndex.toString();

          // Use clean display name for project
          const rawProject = conversation.project || _project;
          const displayProject = this.getDisplayName(rawProject);

          // Use parsed date if it exists and looks valid, otherwise use file mtime
          // Check if conversation.modified has more than just a date (has time component)
          const hasTimeComponent = conversation.modified && (
            conversation.modified.includes('T') || // ISO format: 2025-10-01T12:00:00Z
            conversation.modified.includes(':')    // Space format: 2025-10-01 12:00:00
          );
          const modifiedDate = hasTimeComponent ? conversation.modified : (file.mtime ? file.mtime.toISOString() : new Date().toISOString());

          const document = {
            id: `${_project}_${sessionId}`,
            content: conversation.fullText.trim(),
            project: displayProject,
            keywords: '',
            toolsUsed: '',
            preview: preview,
            modified: modifiedDate,
            wordCount: conversation.wordCount,
            messageCount: conversation.messageCount
          };

          documents.push(document);

          // Store conversation data for retrieval
          this.conversationData.set(document.id, {
            project: displayProject,
            rawProject: rawProject, // Keep original for reference
            exportedFile: filePath,
            originalPath: filePath,
            modified: document.modified,
            wordCount: document.wordCount,
            messageCount: document.messageCount,
            preview: document.preview,
            fullText: document.content,
            content: document.content,
            _fullText: document.content,
            _content: document.content,

            // Analytics metadata
            firstTimestamp: conversation.firstTimestamp || null,
            lastTimestamp: conversation.lastTimestamp || null,
            durationMs: conversation.durationMs || 0,
            userTurns: conversation.userTurns || 0,
            assistantTurns: conversation.assistantTurns || 0,
            totalTurns: conversation.totalTurns || 0,
            toolCount: conversation.toolCount || 0
          });

          conversationIndex++;
        } catch (error) {
          this.logger.error(`Error reading file ${file}: ${error.message}`);
        }
      }
    }

    // Extract keywords from all conversations using TF-IDF
    if (documents.length > 0) {
      this.logger.info('Extracting keywords from conversations...');

      // Build keyword extractor corpus
      const extractor = new KeywordExtractor({ logger: this.logger });
      const conversations = documents.map(doc => ({ fullText: doc.content }));
      extractor.buildCorpus(conversations);

      // Extract keywords for each document
      for (let i = 0; i < documents.length; i++) {
        const keywords = extractor.extractKeywords(documents[i].content, 10, i);

        // NOTE: keywords property dual format:
        // - documents[i].keywords (string) = for MiniSearch text indexing
        // - convData.keywords (array) = for filtering/display with scores
        // Update document with keywords
        documents[i].keywords = keywords.map(k => k.term).join(' ');  // For search indexing
        documents[i].keywordList = keywords;  // Store full keyword objects with scores

        // Update conversationData with keywords
        const docId = documents[i].id;
        const convData = this.conversationData.get(docId);
        if (convData) {
          convData.keywords = keywords;
          convData.keywordString = documents[i].keywords;
        } else {
          // DEBUG: Log when conversationData doesn't have the document
          this.logger.warn(`Could not find conversation ${docId} in conversationData for keyword update`);
        }
      }

      this.logger.info(`Extracted keywords for ${documents.length} conversations`);
    }

    // Add all documents to index
    if (documents.length > 0) {
      this.miniSearch.addAll(documents);
    }

    // Update stats
    this.stats.totalDocuments = documents.length;
    this.stats.totalConversations = documents.length;
    this.stats.indexedAt = new Date().toISOString();
    this.stats.indexSizeBytes = JSON.stringify(this.miniSearch.toJSON()).length;
    this.stats.indexSize = documents.length; // For compatibility
    
    // Save the index to disk
    await this.saveIndex();
    
    this.indexLoaded = true;
    
    return this.stats;
  }

  /**
   * Search with MiniSearch's built-in capabilities
   */
  async search(query, options = {}) {
    const startTime = performance.now();
    
    // Validate query - return empty results for invalid input
    if (!query || typeof query !== 'string' || query.trim() === '') {
      return {
        results: [],
        totalFound: 0,
        searchTime: performance.now() - startTime
      };
    }
    
    // Check if projectsDir exists first - if not, we can't search
    if (!existsSync(this.projectsDir)) {
      this.logger.debug('ProjectsDir does not exist, cannot search');
      return {
        results: [],
        totalFound: 0,
        searchTime: performance.now() - startTime
      };
    }
    
    // ProjectsDir exists, try to load or build index
    if (!this.indexLoaded) {
      const loaded = await this.loadIndex();
      // If loading failed, try to build
      if (!loaded) {
        await this.buildIndex();
      }
    }
    
    // If still no index after loading/building, return empty
    if (!this.miniSearch) {
      return {
        results: [],
        totalFound: 0,
        searchTime: performance.now() - startTime
      };
    }
    
    // Parse query to handle exact phrases and operators
    const { searchQuery, searchOptions, phrases } = this.parseQuery(query);

    // Apply additional options
    if (options.limit) {
      searchOptions.limit = options.limit;
    }

    // If query is empty but we have phrases OR filters, we need to get all documents for filtering
    let results = [];
    try {
      if (searchQuery.trim() === '' && (phrases.length > 0 || searchOptions.filter)) {
        // Searching only for exact phrases or filters - get all documents
        // Convert all conversationData to result format for filtering
        results = Array.from(this.conversationData.entries()).map(([id, _conv]) => ({
          id,
          score: 1, // Default score since we have no query terms
          terms: [],
          match: {}
        }));
      } else if (searchQuery.trim() === '') {
        // Empty query with no phrases or filters - return empty
        results = [];
      } else {
        // Normal search with query terms
        results = this.miniSearch.search(searchQuery, searchOptions);
      }
    } catch (err) {
      this.logger.error('Search error:', err.message);
      return {
        results: [],
        totalFound: 0,
        searchTime: performance.now() - startTime
      };
    }
    
    // Apply filters
    if (options.conversationId) {
      results = results.filter(r => {
        const conv = this.conversationData.get(r.id);
        return conv && conv.conversationId === options.conversationId;
      });
    }
    
    if (options.dateRange) {
      results = results.filter(r => {
        const conv = this.conversationData.get(r.id);
        if (!conv || !conv.timestamp) return false;
        const msgDate = new Date(conv.timestamp);
        return msgDate >= options.dateRange.start && msgDate <= options.dateRange.end;
      });
    }
    
    // Apply role filter if specified
    if (searchOptions.roleFilter) {
      results = results.filter(r => {
        const conv = this.conversationData.get(r.id);
        return conv && conv.role === searchOptions.roleFilter;
      });
    }

    // Apply phrase filter - only include results that contain ALL quoted phrases
    if (phrases.length > 0) {
      results = results.filter(r => {
        const conv = this.conversationData.get(r.id);
        if (!conv) return false;

        const fullText = (conv._fullText || conv.fullText || '').toLowerCase();

        // Check if ALL phrases exist in the text
        return phrases.every(phrase => {
          return fullText.includes(phrase.toLowerCase());
        });
      });
    }

    // Apply keyword filter if specified (from parseQuery)
    if (searchOptions.filter) {
      results = results.filter(searchOptions.filter);
    }
    
    // Enrich results with full conversation data
    const enrichedResults = [];
    const limit = options.limit || 20;
    
    for (const result of results.slice(0, limit)) {
      const conversation = this.conversationData.get(result.id);
      if (!conversation) continue;

      const fullText = conversation._fullText || conversation.fullText || '';
      const content = conversation._content || conversation.content || fullText;
      
      // Find all occurrences for navigation
      const allOccurrences = this.findAllOccurrences(fullText, searchQuery, phrases);
      
      // Generate preview for each occurrence with [HIGHLIGHT] markers
      const occurrencesWithPreviews = allOccurrences.map(occ => ({
        ...occ,
        preview: this.generatePreviewForOccurrence(fullText, occ, searchQuery, phrases)
      }));
      
      // Use first occurrence preview as default preview
      let preview = conversation.preview || '';
      if (occurrencesWithPreviews.length > 0) {
        preview = occurrencesWithPreviews[0].preview;
      }
      
      const enriched = {
        ...conversation,
        content: content,
        relevance: result.score / (results[0]?.score || 1), // Normalize score
        preview,
        matches: result.match, // Which fields matched
        terms: result.terms,   // Which search terms matched
        occurrences: occurrencesWithPreviews,
        currentOccurrenceIndex: 0,
        totalOccurrences: occurrencesWithPreviews.length,
        fullText: fullText,
        queryWords: searchQuery.split(/\s+/).filter(t => t),
        queryPhrases: phrases
      };
      
      // Add highlights if requested
      if (options.highlight) {
        enriched.highlights = allOccurrences.slice(0, 5).map(occ => ({
          text: occ.word,
          position: occ.index
        }));
      }
      
      // Add context if requested
      if (options.contextWords) {
        const contextSize = options.contextWords * 5; // approximate chars per word
        if (allOccurrences.length > 0) {
          const occ = allOccurrences[0];
          const start = Math.max(0, occ.index - contextSize);
          const end = Math.min(fullText.length, occ.index + occ.length + contextSize);
          enriched.context = fullText.substring(start, end).trim();
        }
      }
      
      enrichedResults.push(enriched);
    }
    
    const duration = performance.now() - startTime;
    
    // Always return object format that the CLI expects
    return {
      results: enrichedResults,
      searchTime: duration,
      totalFound: enrichedResults.length,
      suggestions: options.includeSuggestions ? this.miniSearch.autoSuggest(query, { fuzzy: 0.2 }) : undefined
    };
  }

  /**
   * Parse query to handle exact phrases and search operators
   */
  parseQuery(query) {
    const searchOptions = { ...this.miniSearch.searchOptions };

    // Handle exact phrases in quotes
    const phrases = [];
    let modifiedQuery = query.replace(/"([^"]+)"/g, (match, phrase) => {
      phrases.push(phrase);
      return ''; // Remove phrase from query - we'll filter by it instead
    });
    
    // Handle prefix search with asterisk
    const hasWildcard = modifiedQuery.includes('*');
    if (hasWildcard) {
      // Remove the asterisk - MiniSearch handles prefix search automatically
      modifiedQuery = modifiedQuery.replace(/\*/g, '');
      searchOptions.prefix = true;
    }
    
    // Handle OR operator (default is already OR)
    if (modifiedQuery.includes(' OR ')) {
      searchOptions.combineWith = 'OR';
    }
    
    // Handle AND operator
    if (modifiedQuery.includes(' AND ')) {
      searchOptions.combineWith = 'AND';
      modifiedQuery = modifiedQuery.replace(/ AND /g, ' ');
    }
    
    // Handle NOT operator (exclusion)
    const excludeTerms = [];
    modifiedQuery = modifiedQuery.replace(/\s+NOT\s+(\S+)/g, (match, term) => {
      excludeTerms.push(term);
      return '';
    });
    
    if (excludeTerms.length > 0) {
      searchOptions.filter = (result) => {
        // Exclude results containing excluded terms
        const conv = this.conversationData.get(result.id);
        const text = (conv?.fullText || '').toLowerCase();
        return !excludeTerms.some(term => text.includes(term.toLowerCase()));
      };
    }
    
    // Handle field-specific search (e.g., project:toast, role:human, keyword:typescript)
    const keywordFilters = [];
    modifiedQuery = modifiedQuery.replace(/(\w+):(\S+)/g, (match, field, value) => {
      if (['project', 'tools', 'role', 'keyword', 'keywords'].includes(field)) {
        if (field === 'role') {
          // Filter by role in post-processing
          searchOptions.roleFilter = value;
        } else if (field === 'keyword' || field === 'keywords') {
          // Support keyword:term and keywords:term1,term2
          const terms = value.split(',').map(t => t.trim().toLowerCase());
          keywordFilters.push(...terms);
          return ''; // Remove from query - filter by keywords instead
        } else {
          searchOptions.fields = [field];
        }
        return value;
      }
      return match;
    });

    // Add keyword filter if specified
    if (keywordFilters.length > 0) {
      const existingFilter = searchOptions.filter;
      searchOptions.filter = (result) => {
        // Get conversation keywords
        const conv = this.conversationData.get(result.id);
        if (!conv || !conv.keywords) return false;

        // Extract keyword terms
        const convKeywords = conv.keywords.map(k =>
          (typeof k === 'string' ? k : k.term).toLowerCase()
        );

        // Check if ANY of the requested keywords match
        const hasKeyword = keywordFilters.some(kw =>
          convKeywords.some(ck => ck.includes(kw))
        );

        // Apply existing filter if present
        if (existingFilter && hasKeyword) {
          return existingFilter(result);
        }

        return hasKeyword;
      };
    }
    
    // Handle fuzzy search operator ~
    if (modifiedQuery.includes('~')) {
      searchOptions.fuzzy = 0.3; // Increase fuzziness
      modifiedQuery = modifiedQuery.replace(/~/g, '');
    }
    
    return {
      searchQuery: modifiedQuery.trim(),
      searchOptions,
      phrases
    };
  }

  /**
   * Find all occurrences of search terms in text
   */
  findAllOccurrences(fullText, searchQuery, phrases = []) {
    const occurrences = [];
    
    // Remove phrases from query to get individual terms
    let cleanQuery = searchQuery;
    for (const phrase of phrases) {
      cleanQuery = cleanQuery.replace(`"${phrase}"`, '');
    }
    
    const terms = cleanQuery.trim() ? cleanQuery.toLowerCase().split(/\s+/).filter(t => t) : [];
    
    // Find individual term occurrences
    for (const term of terms) {
      const regex = new RegExp(`\\b(${term}\\w*)`, 'gi');
      let match;
      while ((match = regex.exec(fullText)) !== null) {
        occurrences.push({
          index: match.index,
          length: match[0].length,
          word: match[0],
          queryWord: term,
          isPhrase: false
        });
      }
    }
    
    // Find phrase occurrences
    for (const phrase of phrases) {
      const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      let match;
      while ((match = regex.exec(fullText)) !== null) {
        occurrences.push({
          index: match.index,
          length: match[0].length,
          word: match[0],
          queryWord: phrase,
          isPhrase: true
        });
      }
    }
    
    // Sort by position
    occurrences.sort((a, b) => a.index - b.index);
    return occurrences;
  }

  /**
   * Generate preview for a specific occurrence
   */
  generatePreviewForOccurrence(fullText, occurrence, searchQuery, phrases = []) {
    const contextSize = 100;
    const start = Math.max(0, occurrence.index - contextSize);
    const end = Math.min(fullText.length, occurrence.index + occurrence.length + contextSize);
    
    let preview = fullText.substring(start, end).trim();
    
    // Add ellipsis if truncated
    if (start > 0) preview = '...' + preview;
    if (end < fullText.length) preview = preview + '...';
    
    // Highlight matching terms
    // Remove phrases from query to get individual terms
    let cleanQuery = searchQuery;
    for (const phrase of phrases) {
      cleanQuery = cleanQuery.replace(`"${phrase}"`, '');
    }
    
    const terms = cleanQuery.trim() ? cleanQuery.toLowerCase().split(/\s+/).filter(t => t) : [];
    
    // Highlight phrases first (they take priority)
    for (const phrase of phrases) {
      const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      preview = preview.replace(regex, '[HIGHLIGHT]$&[/HIGHLIGHT]');
    }
    
    // Then highlight individual terms not already in highlighted phrases
    for (const term of terms) {
      // Escape special regex characters in term
      const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b(${escapedTerm}\\w*)`, 'gi');
      
      // Create a temporary string to track positions
      const originalPreview = preview;
      let result = '';
      let lastIndex = 0;
      let match;
      
      // Reset regex
      regex.lastIndex = 0;
      
      while ((match = regex.exec(originalPreview)) !== null) {
        const matchStart = match.index;
        const matchEnd = matchStart + match[0].length;
        
        // Check if this match is inside an existing highlight
        const beforeMatch = originalPreview.substring(0, matchStart);
        const lastHighlightStart = beforeMatch.lastIndexOf('[HIGHLIGHT]');
        const lastHighlightEnd = beforeMatch.lastIndexOf('[/HIGHLIGHT]');
        
        const isInsideHighlight = lastHighlightStart > lastHighlightEnd;
        
        if (!isInsideHighlight) {
          // Add text before match
          result += originalPreview.substring(lastIndex, matchStart);
          // Add highlighted match
          result += '[HIGHLIGHT]' + match[0] + '[/HIGHLIGHT]';
          lastIndex = matchEnd;
        }
      }
      
      // Add remaining text
      if (lastIndex > 0) {
        result += originalPreview.substring(lastIndex);
        preview = result;
      }
    }
    
    return preview;
  }

  /**
   * Generate preview with context and highlighting
   */
  generatePreview(fullText, query, _matches, phrases = []) {
    if (!fullText) return '';
    
    // Extract phrases from the query
    const quotedPhrases = phrases.length > 0 ? phrases : [];
    
    // Remove quoted phrases from query to get individual terms
    let cleanQuery = query;
    for (const phrase of quotedPhrases) {
      cleanQuery = cleanQuery.replace(`"${phrase}"`, '');
    }
    
    const queryTerms = cleanQuery.trim() ? cleanQuery.toLowerCase().split(/\s+/).filter(t => t) : [];
    const contextSize = 100;
    
    // Find first occurrence - prioritize phrases, then terms
    let bestIndex = -1;
    
    // First look for phrase matches
    for (const phrase of quotedPhrases) {
      const index = fullText.toLowerCase().indexOf(phrase.toLowerCase());
      if (index !== -1 && (bestIndex === -1 || index < bestIndex)) {
        bestIndex = index;
      }
    }
    
    // Then look for individual term matches if no phrase found
    if (bestIndex === -1) {
      for (const term of queryTerms) {
        const index = fullText.toLowerCase().indexOf(term);
        if (index !== -1 && (bestIndex === -1 || index < bestIndex)) {
          bestIndex = index;
        }
      }
    }
    
    if (bestIndex === -1) {
      // No exact match found, return beginning
      return fullText.slice(0, 200) + '...';
    }
    
    // Extract context around match
    const start = Math.max(0, bestIndex - contextSize);
    const end = Math.min(fullText.length, bestIndex + contextSize + 50);
    
    let preview = fullText.slice(start, end);
    
    // Add ellipsis if truncated
    if (start > 0) preview = '...' + preview;
    if (end < fullText.length) preview = preview + '...';
    
    // Highlight phrases first (they take priority)
    for (const phrase of quotedPhrases) {
      const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      preview = preview.replace(regex, '[HIGHLIGHT]$&[/HIGHLIGHT]');
    }
    
    // Then highlight individual terms (but not if they're already part of a highlighted phrase)
    for (const term of queryTerms) {
      // Only highlight terms that aren't already within [HIGHLIGHT] tags
      const regex = new RegExp(`(?![^\\[]*\\])\\b(${term}\\w*)`, 'gi');
      preview = preview.replace(regex, (match, p1, offset, string) => {
        // Check if this match is already inside a highlight
        const before = string.substring(0, offset);
        const after = string.substring(offset);
        const lastHighlightStart = before.lastIndexOf('[HIGHLIGHT]');
        const lastHighlightEnd = before.lastIndexOf('[/HIGHLIGHT]');
        const nextHighlightEnd = after.indexOf('[/HIGHLIGHT]');
        
        // If we're inside a highlight tag, don't double-highlight
        if (lastHighlightStart > lastHighlightEnd && nextHighlightEnd !== -1) {
          return match;
        }
        return '[HIGHLIGHT]' + match + '[/HIGHLIGHT]';
      });
    }
    
    return preview;
  }

  /**
   * Extract text from message content (string or array)
   */
  extractTextContent(content) {
    let text = '';
    
    if (typeof content === 'string') {
      text = content;
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (typeof part === 'string') {
          text += ' ' + part;
        } else if (part.type === 'text' && part.text) {
          text += ' ' + part.text;
        } else if (part.text) {
          text += ' ' + part.text;
        }
      }
    }
    
    return text.trim();
  }
  
  /**
   * Extract text from message object (backward compatibility)
   */
  extractTextFromMessage(message) {
    if (message.content) {
      return this.extractTextContent(message.content);
    }
    return '';
  }

  /**
   * Save index to disk
   */
  async saveIndex() {
    // Prepare stats without indexSizeBytes to avoid inflation
    const statsToSave = {
      totalDocuments: this.stats.totalDocuments,
      totalConversations: this.stats.totalConversations,
      documentCount: this.stats.totalDocuments, // For backwards compatibility
      indexedAt: this.stats.indexedAt
    };
    
    // Convert Map to array, keeping fullText for instant search highlighting
    const conversationEntries = Array.from(this.conversationData.entries()).map(([id, conv]) => {
      const filteredConv = {};
      for (const [key, value] of Object.entries(conv)) {
        // Keep all fields including fullText for instant highlighting
        // Only filter out truly private fields that start with double underscore
        if (!key.startsWith('__')) {
          filteredConv[key] = value;
        }
      }
      return [id, filteredConv];
    });
    
    const indexData = {
      version: '2.0',
      buildDate: new Date().toISOString(),
      miniSearchData: this.miniSearch.toJSON(),
      conversationData: conversationEntries,
      stats: statsToSave,
      // Include documents array for backward compatibility (derived from conversationData)
      documents: conversationEntries.map(([_id, conv]) => ({
        id: conv.conversationId,
        name: conv.name,
        project: conv.project,
        modified: conv.modified
      }))
    };
    
    // Write to file (use compact JSON for smaller size)
    const jsonString = JSON.stringify(indexData);
    await writeFile(this.indexPath, jsonString);
    
    // Update stats with actual written size
    this.stats.indexSizeBytes = jsonString.length;
  }

  /**
   * Load index from disk
   */
  async loadIndex() {
    try {
      const content = await readFile(this.indexPath, 'utf-8');

      // Yield to event loop before heavy parsing to keep spinners animated
      await new Promise(resolve => setImmediate(resolve));

      const indexData = JSON.parse(content);

      // Yield again after parsing
      await new Promise(resolve => setImmediate(resolve));
      
      // Initialize MiniSearch and restore from saved data
      this.initializeMiniSearch();
      
      // MiniSearch.loadJSON expects the configuration in the second parameter
      const miniSearchConfig = {
        fields: ['content', 'project', 'keywords', 'toolsUsed', 'preview'],
        storeFields: ['project', 'modified', 'wordCount', 'messageCount', 'keywordList'],
        searchOptions: {
          boost: {
            project: 3,
            keywords: 2,
            content: 1
          },
          fuzzy: 0.2,
          prefix: true,
          combineWith: 'OR'
        }
      };
      
      // MiniSearch.loadJSON expects a JSON string, not an object
      const miniSearchDataString = typeof indexData.miniSearchData === 'string' 
        ? indexData.miniSearchData 
        : JSON.stringify(indexData.miniSearchData);
      
      this.miniSearch = MiniSearch.loadJSON(miniSearchDataString, miniSearchConfig);
      this.index = this.miniSearch; // Expose for tests
      
      // Restore conversation data
      this.conversationData = new Map(indexData.conversationData);
      
      // Restore stats
      if (indexData.stats) {
        this.stats = indexData.stats;
      }
      
      this.indexLoaded = true;
      return true;
    } catch (error) {
      // If index doesn't exist or is invalid, set index to null
      this.index = null;
      this.miniSearch = null;
      
      if (error.code !== 'ENOENT') {
        this.logger.error('Failed to load index:', error.message);
      }
      return false;
    }
  }

  /**
   * Get all conversations when no search term
   */
  getAllConversations() {
    const results = Array.from(this.conversationData.values())
      .slice(0, 20)
      .map(conv => ({
        ...conv,
        relevance: 1.0,
        preview: conv.preview || ''
      }));
    
    return {
      results,
      searchTime: 0,
      totalFound: this.conversationData.size
    };
  }

  /**
   * Get search suggestions
   */
  async getSuggestions(prefix) {
    if (!this.indexLoaded) {
      await this.loadIndex();
    }
    
    return this.miniSearch.autoSuggest(prefix, {
      fuzzy: 0.2,
      limit: 10
    });
  }

  /**
   * Smart index update - incremental for small changes, full rebuild for large changes
   */
  async smartUpdate() {
    // Load existing index
    const loaded = await this.loadIndex();
    if (!loaded) {
      return await this.buildIndex();
    }

    // Check how many new files there are
    const lastBuildTime = new Date(this.stats.indexedAt);
    const files = await readdir(this.exportDir);
    let newFileCount = 0;

    for (const file of files) {
      // Skip backups, hidden files, and non-md files
      if (file.startsWith('.') || file.startsWith('archive-backup') || !file.endsWith('.md') || this.isDocumentationFile(file)) {
        continue;
      }
      const filePath = join(this.exportDir, file);
      try {
        const fileStat = await stat(filePath);
        // Skip directories
        if (fileStat.isDirectory()) {
          continue;
        }
        if (fileStat.mtime > lastBuildTime) {
          newFileCount++;
        }
      } catch {
        continue;
      }
    }

    // If more than 20% new files, do full rebuild (faster and ensures consistency)
    const threshold = this.stats.totalConversations * 0.2;
    if (newFileCount > threshold) {
      this.logger.info(`${newFileCount} new files (>${threshold.toFixed(0)} threshold) - doing full rebuild`);
      const result = await this.buildIndex();
      return {
        ...result,
        newFiles: newFileCount,
        method: 'full_rebuild'
      };
    }

    // Otherwise do incremental update
    const result = await this.updateIndex();
    return {
      ...result,
      method: 'incremental'
    };
  }

  /**
   * Update index incrementally - only add new/modified files
   */
  async updateIndex() {
    // Load existing index first
    const loaded = await this.loadIndex();
    if (!loaded) {
      // No existing index - do full build
      return await this.buildIndex();
    }

    // Get last build time
    const lastBuildTime = new Date(this.stats.indexedAt);

    // Scan for files newer than last build
    if (!existsSync(this.exportDir)) {
      this.logger.warn(`Export directory does not exist: ${this.exportDir}`);
      return { totalDocuments: 0, totalConversations: 0, newFiles: 0 };
    }

    const files = await readdir(this.exportDir);
    const newFiles = [];

    for (const file of files) {
      // Skip backups, hidden files, and non-md files
      if (file.startsWith('.') || file.startsWith('archive-backup') || !file.endsWith('.md') || this.isDocumentationFile(file)) {
        continue;
      }

      const filePath = join(this.exportDir, file);
      try {
        const fileStat = await stat(filePath);

        // Skip directories
        if (fileStat.isDirectory()) {
          continue;
        }

        // Only process files modified after last index build
        if (fileStat.mtime > lastBuildTime) {
          newFiles.push({ path: filePath, name: file, mtime: fileStat.mtime });
        }
      } catch {
        continue;
      }
    }

    if (newFiles.length === 0) {
      this.logger.info('Index is up to date - no new files to add');
      return {
        totalDocuments: this.stats.totalDocuments,
        totalConversations: this.stats.totalConversations,
        newFiles: 0
      };
    }

    this.logger.info(`Processing ${newFiles.length} new/modified files`);

    // Process only new files
    const newDocuments = [];
    const updatedDocuments = [];
    const processedSessionIds = new Set(); // Track session IDs in this batch to avoid duplicates

    for (const file of newFiles) {
      try {
        const conversation = await this.parseMarkdownConversation(file.path);

        if (!conversation.sessionId) {
          this.logger.warn(`Skipping ${file.name}: no session ID`);
          continue;
        }
        if (!conversation.fullText || conversation.fullText.trim().length === 0) {
          this.logger.warn(`Skipping ${file.name}: empty content`);
          continue;
        }

        // Skip if we've already processed this session ID in this batch
        if (processedSessionIds.has(conversation.sessionId)) {
          this.logger.warn(`Skipping ${file.name}: duplicate session ID ${conversation.sessionId} already processed in this batch`);
          continue;
        }
        processedSessionIds.add(conversation.sessionId);

        const rawProject = conversation.project || 'Unknown';
        const displayProject = this.getDisplayName(rawProject);

        // Use parsed date if it has time component (full ISO), otherwise use file mtime
        const hasTimeComponent = conversation.modified && conversation.modified.includes('T');
        const modifiedDate = hasTimeComponent ? conversation.modified : (file.mtime ? file.mtime.toISOString() : new Date().toISOString());

        const document = {
          id: conversation.sessionId,
          content: conversation.fullText,
          project: displayProject,
          keywords: '',
          toolsUsed: '',
          preview: conversation.fullText.substring(0, 200),
          modified: modifiedDate,
          wordCount: conversation.wordCount,
          messageCount: conversation.messageCount
        };

        // Check if this session ID already exists in index
        // We need to check BOTH conversationData AND the MiniSearch index itself
        const existsInData = this.conversationData.has(conversation.sessionId);
        let existsInIndex = false;
        try {
          // Try to check if document exists in MiniSearch index
          const results = this.miniSearch.search(conversation.sessionId, { prefix: false, fuzzy: false });
          existsInIndex = results.some(r => r.id === conversation.sessionId);
        } catch (err) {
          // If search fails, assume it doesn't exist
        }

        const documentExists = existsInData || existsInIndex;

        if (documentExists) {
          // Update existing document - remove old one first
          try {
            this.miniSearch.discard(conversation.sessionId);
          } catch (err) {
            // Document might not exist in index, that's ok
            this.logger.warn(`Could not remove existing document ${conversation.sessionId}: ${err.message}`);
          }
          updatedDocuments.push(document);
        } else {
          // New document
          newDocuments.push(document);
        }

        // Store/update conversation data
        this.conversationData.set(document.id, {
          project: displayProject,
          rawProject: rawProject,
          exportedFile: file.path,
          originalPath: file.path,
          modified: conversation.modified,
          wordCount: conversation.wordCount,
          messageCount: conversation.messageCount,
          preview: document.preview,
          fullText: conversation.fullText,
          content: conversation.fullText,
          _fullText: conversation.fullText,
          _content: conversation.fullText,

          // Analytics metadata
          firstTimestamp: conversation.firstTimestamp || null,
          lastTimestamp: conversation.lastTimestamp || null,
          durationMs: conversation.durationMs || 0,
          userTurns: conversation.userTurns || 0,
          assistantTurns: conversation.assistantTurns || 0,
          totalTurns: conversation.totalTurns || 0,
          toolCount: conversation.toolCount || 0
        });
      } catch (error) {
        this.logger.error(`Error processing ${file.name}: ${error.message}`);
      }
    }

    // Extract keywords for new/updated documents
    const allDocuments = [...newDocuments, ...updatedDocuments];
    if (allDocuments.length > 0) {
      this.logger.info('Extracting keywords for new/updated conversations...');

      // For incremental updates, we need to rebuild the corpus with ALL conversations
      // to maintain accurate TF-IDF scores across the entire corpus
      const extractor = new KeywordExtractor({ logger: this.logger });

      // Get all conversations including new ones
      const allConversations = [];
      for (const conv of this.conversationData.values()) {
        allConversations.push({ fullText: conv.fullText || conv.content || '' });
      }
      // Add new documents to corpus
      for (const doc of allDocuments) {
        allConversations.push({ fullText: doc.content });
      }

      extractor.buildCorpus(allConversations);

      // Extract keywords for new/updated documents
      // Use the correct index in the corpus (after existing conversations)
      const startIndex = this.conversationData.size;
      for (let i = 0; i < allDocuments.length; i++) {
        const keywords = extractor.extractKeywords(allDocuments[i].content, 10, startIndex + i);

        // Update document with keywords
        allDocuments[i].keywords = keywords.map(k => k.term).join(' ');
        allDocuments[i].keywordList = keywords;

        // Update conversationData with keywords
        const convData = this.conversationData.get(allDocuments[i].id);
        if (convData) {
          convData.keywords = keywords;
          convData.keywordString = allDocuments[i].keywords;
        }
      }

      this.logger.info(`Extracted keywords for ${allDocuments.length} new/updated conversations`);
    }

    // Add/update documents in index one at a time to avoid duplicate ID errors
    let _addedCount = 0;
    let _failedCount = 0;
    for (const doc of allDocuments) {
      try {
        this.miniSearch.add(doc);
        _addedCount++;
      } catch (err) {
        // If add fails due to duplicate, try discard + add
        if (err.message && err.message.includes('duplicate ID')) {
          try {
            this.miniSearch.discard(doc.id);
            this.miniSearch.add(doc);
            _addedCount++;
          } catch (err2) {
            this.logger.error(`Failed to update document ${doc.id}: ${err2.message}`);
            _failedCount++;
          }
        } else {
          this.logger.error(`Failed to add document ${doc.id}: ${err.message}`);
          _failedCount++;
        }
      }
    }

    // Update stats
    this.stats.totalDocuments += newDocuments.length; // Only count truly new ones
    this.stats.totalConversations += newDocuments.length;
    this.stats.indexedAt = new Date().toISOString();

    return {
      totalDocuments: this.stats.totalDocuments,
      totalConversations: this.stats.totalConversations,
      newFiles: newDocuments.length,
      updatedFiles: updatedDocuments.length
    };
  }

  /**
   * Process a single conversation for indexing
   * @private
   */
  async processConversation(conv) {
    let fullContent = '';
    
    if (conv.fullText) {
      fullContent = conv.fullText;
    } else if (conv.originalPath) {
      try {
        const content = await readFile(conv.originalPath, 'utf-8');
        const lines = content.trim().split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if ((data.type === 'user' || data.type === 'assistant') && data.message && !data.isMeta) {
              fullContent += ' ' + this.extractTextFromMessage(data.message);
            }
          } catch (err) {
            // Skip invalid JSON lines
          }
        }
      } catch (error) {
        this.logger.error(`Error reading ${conv.originalPath}:`, error.message);
      }
    }
    
    const keywords = conv.keywords || this.extractKeywords(fullContent).join(' ');
    const toolsUsed = conv.toolsUsed || [];
    
    return {
      id: conv.id || conv.path || `conv-${Date.now()}`,
      content: fullContent.slice(0, 50000),
      project: conv.project || 'unknown',
      keywords: keywords,
      toolsUsed: toolsUsed.join(' '),
      preview: (conv.preview || fullContent.slice(0, 200)).replace(/\n/g, ' '),
      modified: conv.modified || new Date().toISOString(),
      wordCount: conv.wordCount || fullContent.split(/\s+/).length,
      messageCount: conv.messageCount || 0
    };
  }

  /**
   * Check if index needs to be rebuilt
   * @returns {boolean} True if rebuild is needed
   */
  async needsRebuild() {
    try {
      // Check if index file exists
      if (!existsSync(this.indexPath)) {
        return true;
      }

      // If we have an archive index (significantly more conversations than active JSONL files),
      // NEVER rebuild automatically - user explicitly built this archive
      if (this.stats.totalConversations > 0) {
        // Count active JSONL files
        let jsonlCount = 0;
        if (existsSync(this.projectsDir)) {
          const projects = await readdir(this.projectsDir);
          for (const project of projects) {
            const projectPath = join(this.projectsDir, project);
            try {
              const projectStat = await stat(projectPath);
              if (projectStat.isDirectory()) {
                const files = await readdir(projectPath);
                jsonlCount += files.filter(f => f.endsWith('.jsonl')).length;
              }
            } catch {
              // Skip inaccessible directories
            }
          }
        }

        // If index has 2x more conversations than active JSONL files, it's an archive - don't rebuild
        if (this.stats.totalConversations > jsonlCount * 2) {
          return false; // Archive index - keep it!
        }
      }

      // Get file stats
      const fileStat = await stat(this.indexPath);
      const indexModTime = fileStat.mtime.getTime();

      // Check if any JSONL file is newer than the index
      if (existsSync(this.projectsDir)) {
        const projects = await readdir(this.projectsDir);

        // Check each project subdirectory
        for (const project of projects) {
          const projectPath = join(this.projectsDir, project);
          const projectStat = await stat(projectPath);
          
          if (projectStat.isDirectory()) {
            const files = await readdir(projectPath);
            const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
            
            for (const file of jsonlFiles) {
              const filePath = join(projectPath, file);
              const fileStats = await stat(filePath);
              if (fileStats.mtime.getTime() > indexModTime) {
                return true; // Found a newer file
              }
            }
          }
        }
      }
      
      return false;
    } catch (error) {
      this.logger.error('Error checking if rebuild needed:', error.message);
      return true;
    }
  }

  /**
   * Optimize the search index
   */
  async optimizeIndex() {
    if (!this.miniSearch) {
      await this.loadIndex();
    }

    // Vacuum removes deleted documents and optimizes storage
    // Wrap in try-catch since vacuum can fail with corrupted indexes
    try {
      this.miniSearch.vacuum();
    } catch (err) {
      this.logger.warn('Vacuum failed (index may be corrupted), skipping optimization:', err.message);
      // Continue with other optimizations even if vacuum fails
    }

    // Keep fullText fields for search highlighting functionality
    // Only remove truly private fields marked with double underscore
    for (const [_id, conv] of this.conversationData.entries()) {
      // Remove only truly private fields (double underscore)
      for (const key of Object.keys(conv)) {
        if (key.startsWith('__')) {
          delete conv[key];
        }
      }

      // Trim preview to reasonable size
      if (conv.preview && conv.preview.length > 200) {
        conv.preview = conv.preview.slice(0, 200);
      }
    }

    // Save the optimized index
    await this.saveIndex();

    this.logger.info('Index optimized and saved');
  }

  /**
   * Get index statistics
   * @returns {Object} Index statistics
   */
  getStats() {
    return {
      totalDocuments: this.stats.totalDocuments,
      totalConversations: this.stats.totalConversations,
      indexSizeBytes: this.stats.indexSizeBytes,
      lastUpdated: this.stats.indexedAt,
      indexedAt: this.stats.indexedAt
    };
  }
}

export default MiniSearchEngine;