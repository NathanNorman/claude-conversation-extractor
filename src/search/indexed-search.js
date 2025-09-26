import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

// Removed unused chalk and colors

export class IndexedSearch {
  constructor() {
    this.indexPath = join(homedir(), '.claude', 'claude_conversations', 'search-index.json');
    this.index = null;
    this.indexLoaded = false;
  }

  /**
   * Parse search query to extract exact phrases (in quotes) and individual terms
   * Handles escape sequences for quotes and backslashes
   * Examples:
   *   'foo bar' -> {terms: ['foo', 'bar'], phrases: []}
   *   '"foo bar"' -> {terms: [], phrases: ['foo bar']}
   *   'foo "bar baz"' -> {terms: ['foo'], phrases: ['bar baz']}
   *   '"escaped \" quote"' -> {terms: [], phrases: ['escaped " quote']}
   */
  parseSearchQuery(query) {
    const phrases = [];
    const terms = [];
    
    // Process the query character by character to handle escaping
    let current = '';
    let inQuotes = false;
    let escaped = false;
    
    for (let i = 0; i < query.length; i++) {
      const char = query[i];
      
      if (escaped) {
        // Add the escaped character literally
        current += char;
        escaped = false;
      } else if (char === '\\') {
        // Next character will be escaped
        escaped = true;
      } else if (char === '"') {
        // Toggle quote mode
        if (inQuotes) {
          // End of quoted phrase
          if (current.trim()) {
            phrases.push(current.trim());
          }
          current = '';
          inQuotes = false;
        } else {
          // Start of quoted phrase - save any accumulated term first
          if (current.trim()) {
            current.trim().split(/\s+/).forEach(t => {
              if (t.length > 2) terms.push(t.toLowerCase());
            });
          }
          current = '';
          inQuotes = true;
        }
      } else if (char === ' ' && !inQuotes) {
        // Space outside quotes - end current term
        if (current.trim()) {
          const term = current.trim().toLowerCase();
          if (term.length > 2) {
            terms.push(term);
          }
        }
        current = '';
      } else {
        // Regular character
        current += char;
      }
    }
    
    // Handle any remaining content
    if (current.trim()) {
      if (inQuotes) {
        // Unclosed quote - treat as phrase
        phrases.push(current.trim());
      } else {
        // Regular terms
        current.trim().split(/\s+/).forEach(t => {
          if (t.length > 2) terms.push(t.toLowerCase());
        });
      }
    }
    
    return { terms, phrases };
  }

  async ensureIndexLoaded() {
    if (!this.indexLoaded) {
      try {
        const content = await readFile(this.indexPath, 'utf-8');
        this.index = JSON.parse(content);
        this.indexLoaded = true;
      } catch (error) {
        throw new Error('Search index not found. Please build the index first.');
      }
    }
  }

  async search(query) {
    const startTime = performance.now();
    
    await this.ensureIndexLoaded();
    
    if (!query || query.trim() === '') {
      // Return all conversations if no query
      return this.getAllConversations();
    }
    
    // Parse the query to extract phrases and terms
    const { terms, phrases } = this.parseSearchQuery(query);
    
    // Phase 1: Quick keyword lookup (1-5ms)
    const candidates = await this.findCandidateConversations(terms, phrases);
    
    // Phase 2: Relevance scoring (5-15ms)
    const scoredResults = await this.scoreRelevance(candidates, terms, phrases);
    
    // Phase 3: Content preview generation (5-10ms)
    const enrichedResults = await this.addPreviews(scoredResults, query, terms, phrases);
    
    const duration = performance.now() - startTime;
    
    // Return results in expected format
    return {
      results: enrichedResults,
      searchTime: duration,
      totalFound: enrichedResults.length
    };
  }

  async findCandidateConversations(terms, phrases) {
    // If no search criteria, return empty
    if (terms.length === 0 && phrases.length === 0) {
      return [];
    }
    
    let candidateIndices = null;
    
    // First, handle individual terms with AND logic
    for (const term of terms) {
      const termIndices = new Set();
      
      // Handle hyphenated terms by checking both the full term and split parts
      // Since the index strips hyphens, "toast-analytics" is indexed as "toast" and "analytics"
      const searchTerms = [term];
      
      // If term contains hyphens, also search for the non-hyphenated version
      if (term.includes('-')) {
        // Add the version without hyphens as one word
        searchTerms.push(term.replace(/-/g, ''));
        // Also split on hyphens to search for parts
        const parts = term.split('-').filter(p => p.length > 0);
        // For hyphenated terms, we need to find docs that have ALL parts
        // We'll handle this specially below
        searchTerms.hyphenParts = parts;
      }
      
      // Direct matches for each search variant
      for (const searchTerm of searchTerms) {
        if (this.index.invertedIndex[searchTerm]) {
          for (const idx of this.index.invertedIndex[searchTerm].conversations) {
            termIndices.add(idx);
          }
        }
        
        // Prefix matches
        for (const indexedWord in this.index.invertedIndex) {
          if (indexedWord.startsWith(searchTerm) && indexedWord !== searchTerm) {
            for (const idx of this.index.invertedIndex[indexedWord].conversations) {
              termIndices.add(idx);
            }
          }
        }
      }
      
      // For hyphenated terms, also find conversations that contain ALL parts
      if (searchTerms.hyphenParts) {
        // Find conversations that contain ALL parts of the hyphenated term
        let hyphenIndices = null;
        for (const part of searchTerms.hyphenParts) {
          const partIndices = new Set();
          if (this.index.invertedIndex[part]) {
            for (const idx of this.index.invertedIndex[part].conversations) {
              partIndices.add(idx);
            }
          }
          
          // Accumulate intersection of all parts
          if (hyphenIndices === null) {
            hyphenIndices = partIndices;
          } else {
            const intersection = new Set();
            for (const idx of hyphenIndices) {
              if (partIndices.has(idx)) {
                intersection.add(idx);
              }
            }
            hyphenIndices = intersection;
          }
        }
        
        // Add conversations that have all parts
        if (hyphenIndices) {
          for (const idx of hyphenIndices) {
            termIndices.add(idx);
          }
        }
      }
      
      // Apply AND logic for terms
      if (candidateIndices === null) {
        candidateIndices = termIndices;
      } else {
        const intersection = new Set();
        for (const idx of candidateIndices) {
          if (termIndices.has(idx)) {
            intersection.add(idx);
          }
        }
        candidateIndices = intersection;
        
        if (candidateIndices.size === 0) {
          return [];
        }
      }
    }
    
    // Handle exact phrases - need to check in full text
    if (phrases.length > 0) {
      const phraseCandidates = new Set();
      
      // For phrases, we need to check the actual text content
      // Start with all conversations if no terms, or filtered set if we have terms
      const indicesToCheck = candidateIndices ? 
        Array.from(candidateIndices) : 
        Array.from({length: this.index.conversations.length}, (_, i) => i);
      
      for (const idx of indicesToCheck) {
        const conversation = this.index.conversations[idx];
        if (!conversation) continue;
        
        // Check if all phrases exist in this conversation
        // We'll check in the preview for quick filtering, but ideally should check full text
        let hasAllPhrases = true;
        for (const phrase of phrases) {
          // Simple check in preview and keywords for now
          const searchText = (conversation.preview + ' ' + conversation.extractedKeywords.join(' ')).toLowerCase();
          if (!searchText.includes(phrase.toLowerCase())) {
            hasAllPhrases = false;
            break;
          }
        }
        
        if (hasAllPhrases) {
          phraseCandidates.add(idx);
        }
      }
      
      candidateIndices = phraseCandidates;
    }
    
    return Array.from(candidateIndices || []);
  }

  async scoreRelevance(candidateIndices, terms, phrases) {
    const scoredResults = [];
    
    for (const idx of candidateIndices) {
      const conversation = this.index.conversations[idx];
      if (!conversation) continue;
      
      let score = 0;
      let matchedWords = 0;
      
      // Score based on individual term matches
      for (const term of terms) {
        if (conversation.extractedKeywords.includes(term)) {
          score += 10; // Exact keyword match
          matchedWords++;
        }
        
        // Check frequency
        if (conversation.keywordFrequency[term]) {
          score += Math.min(conversation.keywordFrequency[term] * 2, 20);
        }
        
        // Check in preview
        if (conversation.preview.toLowerCase().includes(term)) {
          score += 3;
        }
        
        // Check in project name
        if (conversation.project.toLowerCase().includes(term)) {
          score += 5;
        }
        
        // Partial matches in keywords
        for (const keyword of conversation.extractedKeywords) {
          if (keyword.includes(term) && keyword !== term) {
            score += 2;
          }
        }
      }
      
      // Bonus score for exact phrase matches
      for (const phrase of phrases) {
        // Phrase in preview gets high score
        if (conversation.preview.toLowerCase().includes(phrase.toLowerCase())) {
          score += 20;
          matchedWords += phrase.split(/\s+/).length;
        }
        
        // Phrase in project name
        if (conversation.project.toLowerCase().includes(phrase.toLowerCase())) {
          score += 15;
        }
      }
      
      // Calculate relevance percentage
      const maxPossibleScore = Math.max(1, (terms.length * 35) + (phrases.length * 35));
      const relevance = Math.min((score / maxPossibleScore), 1.0);
      
      if (relevance > 0.01) { // Threshold for including results
        scoredResults.push({
          conversation,
          score,
          relevance,
          matchedWords,
          index: idx
        });
      }
    }
    
    // Sort by score
    return scoredResults.sort((a, b) => b.score - a.score);
  }

  async addPreviews(scoredResults, query, terms, phrases) {
    const enrichedResults = [];
    
    for (const result of scoredResults.slice(0, 20)) { // Limit to top 20
      const conversation = result.conversation;
      
      // Read the actual conversation file to get full text
      let fullText = '';
      const allOccurrences = [];
      
      try {
        const content = await readFile(conversation.originalPath, 'utf-8');
        const lines = content.trim().split('\n').filter(line => line.trim());
        
        // Extract all text from messages
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if ((data.type === 'user' || data.type === 'assistant') && data.message && !data.isMeta) {
              const text = this.extractTextFromMessage(data.message);
              fullText += ' ' + text;
            }
          } catch (err) {
            // Skip invalid JSON lines
          }
        }
        
        // Find all occurrences of the search terms and phrases
        // First, find individual term occurrences
        for (const term of terms) {
          const regex = new RegExp(`\\b(${term}\\w*)`, 'gi');
          let match;
          while ((match = regex.exec(fullText)) !== null) {
            allOccurrences.push({
              index: match.index,
              length: match[0].length,
              word: match[0],
              queryWord: term,
              isPhrase: false
            });
          }
        }
        
        // Then find exact phrase occurrences
        for (const phrase of phrases) {
          const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          let match;
          while ((match = regex.exec(fullText)) !== null) {
            allOccurrences.push({
              index: match.index,
              length: match[0].length,
              word: match[0],
              queryWord: phrase,
              isPhrase: true
            });
          }
        }
        
        // Sort occurrences by position
        allOccurrences.sort((a, b) => a.index - b.index);
        
        // Generate first preview only (rest will be generated on-demand)
        const contextSize = 100; // Characters before and after
        let preview = conversation.preview;
        
        if (allOccurrences.length > 0) {
          const firstOcc = allOccurrences[0];
          const start = Math.max(0, firstOcc.index - contextSize);
          const end = Math.min(fullText.length, firstOcc.index + firstOcc.length + contextSize);
          
          preview = fullText.substring(start, end).trim();
          
          // Add ellipsis if truncated
          if (start > 0) preview = '...' + preview;
          if (end < fullText.length) preview = preview + '...';
          
          // Highlight all matching terms and phrases
          for (const term of terms) {
            const highlightRegex = new RegExp(`\\b(${term}\\w*)`, 'gi');
            preview = preview.replace(highlightRegex, (match) => `[HIGHLIGHT]${match}[/HIGHLIGHT]`);
          }
          for (const phrase of phrases) {
            const highlightRegex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            preview = preview.replace(highlightRegex, (match) => `[HIGHLIGHT]${match}[/HIGHLIGHT]`);
          }
        }
        
        // Format the result with occurrence data for on-demand preview generation
        enrichedResults.push({
          project: conversation.project,
          exportedFile: conversation.exportedFile,
          originalPath: conversation.originalPath,
          modified: conversation.modified,
          messageCount: conversation.messageCount,
          relevance: result.relevance,
          preview: preview,
          occurrences: allOccurrences,  // Store all occurrences for on-demand generation
          fullText: fullText,  // Store full text for on-demand preview generation
          queryWords: terms,  // Store query terms for highlighting
          queryPhrases: phrases,  // Store query phrases for highlighting
          currentOccurrenceIndex: 0,  // Track which occurrence is being shown
          totalOccurrences: allOccurrences.length,
          matchedWords: result.matchedWords,
          toolsUsed: conversation.toolsUsed,
          topicTags: conversation.topicTags
        });
        
      } catch (error) {
        // Fall back to static preview if file reading fails
        let preview = conversation.preview;
        
        // Still try to highlight in the static preview
        for (const term of terms) {
          const regex = new RegExp(`\\b(${term}\\w*)`, 'gi');
          preview = preview.replace(regex, (match) => `[HIGHLIGHT]${match}[/HIGHLIGHT]`);
        }
        for (const phrase of phrases) {
          const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          preview = preview.replace(regex, (match) => `[HIGHLIGHT]${match}[/HIGHLIGHT]`);
        }
        
        enrichedResults.push({
          project: conversation.project,
          exportedFile: conversation.exportedFile,
          originalPath: conversation.originalPath,
          modified: conversation.modified,
          messageCount: conversation.messageCount,
          relevance: result.relevance,
          preview: preview,
          occurrences: [],  // No occurrences in fallback
          fullText: '',  // No full text available
          queryWords: terms,
          queryPhrases: phrases,
          currentOccurrenceIndex: 0,
          totalOccurrences: 0,
          matchedWords: result.matchedWords,
          toolsUsed: conversation.toolsUsed,
          topicTags: conversation.topicTags
        });
      }
    }
    
    return enrichedResults;
  }
  
  extractTextFromMessage(message) {
    let text = '';
    
    if (typeof message.content === 'string') {
      text = message.content;
    } else if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type === 'text' && part.text) {
          text += ' ' + part.text;
        }
      }
    }
    
    return text.trim();
  }

  getAllConversations() {
    const results = [];
    
    for (let i = 0; i < this.index.conversations.length; i++) {
      const conversation = this.index.conversations[i];
      results.push({
        project: conversation.project,
        exportedFile: conversation.exportedFile,
        originalPath: conversation.originalPath,
        modified: conversation.modified,
        messageCount: conversation.messageCount,
        relevance: 1.0,
        preview: conversation.preview,
        matchedWords: 0,
        toolsUsed: conversation.toolsUsed,
        topicTags: conversation.topicTags
      });
    }
    
    return {
      results: results.slice(0, 20), // Limit to 20 for display
      searchTime: 0,
      totalFound: results.length
    };
  }

  async getIndexStats() {
    await this.ensureIndexLoaded();
    
    return {
      totalConversations: this.index.metadata.totalConversations,
      totalKeywords: this.index.metadata.totalWords,
      buildDate: this.index.metadata.buildDate,
      version: this.index.metadata.version
    };
  }
}