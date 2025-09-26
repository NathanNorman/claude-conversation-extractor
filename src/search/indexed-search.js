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
    
    // Phase 1: Quick keyword lookup (1-5ms)
    const candidates = await this.findCandidateConversations(query);
    
    // Phase 2: Relevance scoring (5-15ms)
    const scoredResults = await this.scoreRelevance(candidates, query);
    
    // Phase 3: Content preview generation (5-10ms)
    const enrichedResults = await this.addPreviews(scoredResults, query);
    
    const duration = performance.now() - startTime;
    
    // Return results in expected format
    return {
      results: enrichedResults,
      searchTime: duration,
      totalFound: enrichedResults.length
    };
  }

  async findCandidateConversations(query) {
    const queryWords = query.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);
    
    const candidateIndices = new Set();
    
    // Find conversations containing any of the query words
    for (const word of queryWords) {
      if (this.index.invertedIndex[word]) {
        for (const idx of this.index.invertedIndex[word].conversations) {
          candidateIndices.add(idx);
        }
      }
      
      // Also check for words that START with the query word (for prefix matching)
      // This allows "java" to match "javascript", "javabean", etc.
      for (const indexedWord in this.index.invertedIndex) {
        if (indexedWord.startsWith(word) && indexedWord !== word) {
          for (const idx of this.index.invertedIndex[indexedWord].conversations) {
            candidateIndices.add(idx);
          }
        }
      }
    }
    
    return Array.from(candidateIndices);
  }

  async scoreRelevance(candidateIndices, query) {
    const queryWords = query.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);
    
    const scoredResults = [];
    
    for (const idx of candidateIndices) {
      const conversation = this.index.conversations[idx];
      if (!conversation) continue;
      
      let score = 0;
      let matchedWords = 0;
      
      // Score based on keyword matches
      for (const word of queryWords) {
        if (conversation.extractedKeywords.includes(word)) {
          score += 10; // Exact keyword match
          matchedWords++;
        }
        
        // Check frequency
        if (conversation.keywordFrequency[word]) {
          score += Math.min(conversation.keywordFrequency[word] * 2, 20);
        }
        
        // Check in preview
        if (conversation.preview.toLowerCase().includes(word)) {
          score += 3;
        }
        
        // Check in project name
        if (conversation.project.toLowerCase().includes(word)) {
          score += 5;
        }
        
        // Partial matches in keywords
        for (const keyword of conversation.extractedKeywords) {
          if (keyword.includes(word) && keyword !== word) {
            score += 2;
          }
        }
      }
      
      // Calculate relevance percentage
      const maxPossibleScore = queryWords.length * 35; // Theoretical max per word
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

  async addPreviews(scoredResults, query) {
    const queryWords = query.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);
    
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
        
        // Find all occurrences of the search terms
        for (const word of queryWords) {
          const regex = new RegExp(`\\b(${word}\\w*)`, 'gi');
          let match;
          while ((match = regex.exec(fullText)) !== null) {
            allOccurrences.push({
              index: match.index,
              length: match[0].length,
              word: match[0],
              queryWord: word
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
          
          // Highlight all matching words
          for (const word of queryWords) {
            const highlightRegex = new RegExp(`\\b(${word}\\w*)`, 'gi');
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
          queryWords: queryWords,  // Store query words for highlighting
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
        for (const word of queryWords) {
          const regex = new RegExp(`\\b(${word}\\w*)`, 'gi');
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
          queryWords: queryWords,
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