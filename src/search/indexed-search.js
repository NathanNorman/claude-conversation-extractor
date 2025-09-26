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
      
      // Also check for partial matches
      for (const keyword in this.index.invertedIndex) {
        if (keyword.includes(word)) {
          for (const idx of this.index.invertedIndex[keyword].conversations) {
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
        
        // Generate previews for each occurrence (with context)
        const contextSize = 100; // Characters before and after
        const previews = [];
        
        for (const occurrence of allOccurrences.slice(0, 5)) { // Limit to first 5 occurrences
          const start = Math.max(0, occurrence.index - contextSize);
          const end = Math.min(fullText.length, occurrence.index + occurrence.length + contextSize);
          
          let contextText = fullText.substring(start, end).trim();
          
          // Add ellipsis if truncated
          if (start > 0) contextText = '...' + contextText;
          if (end < fullText.length) contextText = contextText + '...';
          
          // Highlight all matching words in this context
          for (const word of queryWords) {
            const highlightRegex = new RegExp(`\\b(${word}\\w*)`, 'gi');
            contextText = contextText.replace(highlightRegex, (match) => `[HIGHLIGHT]${match}[/HIGHLIGHT]`);
          }
          
          previews.push(contextText);
        }
        
        // Use the first occurrence preview as the main preview
        const preview = previews.length > 0 ? previews[0] : conversation.preview;
        
        // Format the result with all occurrence data
        enrichedResults.push({
          project: conversation.project,
          exportedFile: conversation.exportedFile,
          originalPath: conversation.originalPath,
          modified: conversation.modified,
          messageCount: conversation.messageCount,
          relevance: result.relevance,
          preview: preview,
          allPreviews: previews,  // All occurrence previews for navigation
          currentPreviewIndex: 0,  // Track which preview is being shown
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
          allPreviews: [preview],
          currentPreviewIndex: 0,
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