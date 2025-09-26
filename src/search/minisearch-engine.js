import miniSearchPackage from 'minisearch';
const MiniSearch = miniSearchPackage.default || miniSearchPackage;
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

export class MiniSearchEngine {
  constructor() {
    this.indexPath = join(homedir(), '.claude', 'claude_conversations', 'search-index-v2.json');
    this.miniSearch = null;
    this.conversationData = new Map(); // Store full conversation data
    this.indexLoaded = false;
  }

  /**
   * Initialize MiniSearch with optimal configuration for our use case
   */
  initializeMiniSearch() {
    this.miniSearch = new MiniSearch({
      // Fields to index for searching
      fields: ['content', 'project', 'keywords', 'toolsUsed', 'preview'],
      
      // Fields to store and return with results
      storeFields: ['project', 'modified', 'wordCount', 'messageCount'],
      
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
   * Build index from conversations
   */
  async buildIndex(conversations) {
    this.initializeMiniSearch();
    this.conversationData.clear();
    
    const documents = [];
    
    for (let i = 0; i < conversations.length; i++) {
      const conv = conversations[i];
      
      // Check if we already have processed content (from IndexBuilder)
      let fullContent = '';
      
      // If fullText exists, we already processed this in IndexBuilder
      if (conv.fullText) {
        // Use the full text that was already extracted
        fullContent = conv.fullText;
      } else if (conv.originalPath) {
        // Fallback: read full content if we have the path
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
          console.error(`Error reading ${conv.originalPath}:`, error.message);
        }
      }
      
      // Create document for MiniSearch
      const doc = {
        id: i,
        content: fullContent.toLowerCase(),
        project: conv.project || '',
        keywords: (conv.extractedKeywords || []).join(' '),
        toolsUsed: (conv.toolsUsed || []).join(' '),
        preview: conv.preview || '',
        modified: conv.modified,
        wordCount: conv.wordCount || 0,
        messageCount: conv.messageCount || 0
      };
      
      documents.push(doc);
      
      // Store full conversation data for retrieval
      this.conversationData.set(i, {
        ...conv,
        fullText: fullContent
      });
    }
    
    // Add all documents to index
    await this.miniSearch.addAllAsync(documents);
    
    // Save the index
    await this.saveIndex();
    
    return {
      totalDocuments: documents.length,
      indexSize: this.miniSearch.termCount
    };
  }

  /**
   * Search with MiniSearch's built-in capabilities
   */
  async search(query) {
    const startTime = performance.now();
    
    if (!this.indexLoaded) {
      await this.loadIndex();
    }
    
    if (!query || query.trim() === '') {
      return this.getAllConversations();
    }
    
    // Parse query to handle exact phrases
    const { searchQuery, searchOptions, phrases } = this.parseQuery(query);
    
    // Perform search with MiniSearch
    const results = this.miniSearch.search(searchQuery, searchOptions);
    
    // Enrich results with full conversation data
    const enrichedResults = [];
    for (const result of results.slice(0, 20)) {
      const conversation = this.conversationData.get(result.id);
      if (!conversation) continue;
      
      const fullText = conversation.fullText || '';
      
      // Find all occurrences for navigation
      const allOccurrences = this.findAllOccurrences(fullText, searchQuery, phrases);
      
      // Generate preview with highlighted matches
      let preview = conversation.preview || '';
      if (allOccurrences.length > 0) {
        preview = this.generatePreviewForOccurrence(fullText, allOccurrences[0], searchQuery, phrases);
      }
      
      enrichedResults.push({
        ...conversation,
        relevance: result.score / (results[0]?.score || 1), // Normalize score
        preview,
        matches: result.match, // Which fields matched
        terms: result.terms,   // Which search terms matched
        occurrences: allOccurrences,
        currentOccurrenceIndex: 0,
        totalOccurrences: allOccurrences.length,
        fullText: fullText,
        queryWords: searchQuery.split(/\s+/).filter(t => t),
        queryPhrases: phrases
      });
    }
    
    const duration = performance.now() - startTime;
    
    return {
      results: enrichedResults,
      searchTime: duration,
      totalFound: results.length,
      suggestions: this.miniSearch.autoSuggest(query, { fuzzy: 0.2 })
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
      return phrase; // Keep phrase in query but we'll handle it specially
    });
    
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
    
    // Handle field-specific search (e.g., project:toast)
    modifiedQuery = modifiedQuery.replace(/(\w+):(\S+)/g, (match, field, value) => {
      if (['project', 'tools'].includes(field)) {
        searchOptions.fields = [field];
        return value;
      }
      return match;
    });
    
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
      const regex = new RegExp(`\\b(${term}\\w*)`, 'gi');
      preview = preview.replace(regex, (match, capturedGroup, offset, string) => {
        // Check if already inside a highlight
        const before = string.substring(0, offset);
        const after = string.substring(offset);
        const lastHighlightStart = before.lastIndexOf('[HIGHLIGHT]');
        const lastHighlightEnd = before.lastIndexOf('[/HIGHLIGHT]');
        const nextHighlightEnd = after.indexOf('[/HIGHLIGHT]');
        
        if (lastHighlightStart > lastHighlightEnd && nextHighlightEnd !== -1) {
          return match;
        }
        return '[HIGHLIGHT]' + match + '[/HIGHLIGHT]';
      });
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
   * Extract text from message object
   */
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
    
    return text.trim();
  }

  /**
   * Save index to disk
   */
  async saveIndex() {
    const indexData = {
      version: '2.0',
      buildDate: new Date().toISOString(),
      miniSearchData: this.miniSearch.toJSON(),
      conversationData: Array.from(this.conversationData.entries())
    };
    
    await writeFile(this.indexPath, JSON.stringify(indexData, null, 2));
  }

  /**
   * Load index from disk
   */
  async loadIndex() {
    try {
      const content = await readFile(this.indexPath, 'utf-8');
      const indexData = JSON.parse(content);
      
      // Initialize MiniSearch and restore from saved data
      this.initializeMiniSearch();
      
      // MiniSearch.loadJSON expects the configuration in the second parameter
      const miniSearchConfig = {
        fields: ['content', 'project', 'keywords', 'toolsUsed', 'preview'],
        storeFields: ['project', 'modified', 'wordCount', 'messageCount'],
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
      
      // Restore conversation data
      this.conversationData = new Map(indexData.conversationData);
      
      this.indexLoaded = true;
      return true;
    } catch (error) {
      // If index doesn't exist or is invalid, return false
      if (error.code !== 'ENOENT') {
        console.error('Failed to load index:', error.message);
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
}