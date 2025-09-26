import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';

const colors = {
  primary: chalk.cyan,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  info: chalk.cyan,
  muted: chalk.hex('#808080'),
  accent: chalk.magenta,
  highlight: chalk.bold.white,
  dim: chalk.hex('#606060')
};

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
      
      // Generate highlighted preview
      let preview = conversation.preview;
      
      // Highlight matching words
      for (const word of queryWords) {
        const regex = new RegExp(`\\b(${word}\\w*)`, 'gi');
        preview = preview.replace(regex, (match) => `[HIGHLIGHT]${match}[/HIGHLIGHT]`);
      }
      
      // Format the result
      enrichedResults.push({
        project: conversation.project,
        exportedFile: conversation.exportedFile,
        originalPath: conversation.originalPath,
        modified: conversation.modified,
        messageCount: conversation.messageCount,
        relevance: result.relevance,
        preview: preview,
        matchedWords: result.matchedWords,
        toolsUsed: conversation.toolsUsed,
        topicTags: conversation.topicTags
      });
    }
    
    return enrichedResults;
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