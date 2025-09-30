/**
 * Testable CLI Interface
 * Simplified CLI implementation designed for testing
 */

import { EventEmitter } from 'events';
import { readdir, stat, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

// ClaudeConversationExtractor class for testing
class ClaudeConversationExtractor {
  constructor() {
    this.conversationsPath = process.env.HOME ? 
      join(process.env.HOME, '.claude', 'projects') : 
      join(homedir(), '.claude', 'projects');
  }

  async findConversations() {
    const conversations = [];
    
    try {
      const projects = await readdir(this.conversationsPath);
      
      for (const project of projects) {
        const projectPath = join(this.conversationsPath, project);
        const projectStat = await stat(projectPath);
        
        if (projectStat.isDirectory()) {
          try {
            const files = await readdir(projectPath);
            
            for (const file of files) {
              if (file.endsWith('.jsonl')) {
                const filePath = join(projectPath, file);
                const fileStat = await stat(filePath);
                
                conversations.push({
                  path: filePath,
                  name: file,
                  size: fileStat.size,
                  modified: fileStat.mtime,
                  project: project
                });
              }
            }
          } catch (error) {
            // Skip inaccessible directories
          }
        }
      }
    } catch (error) {
      throw new Error('Error accessing conversations directory');
    }
    
    return conversations.sort((a, b) => b.modified.getTime() - a.modified.getTime());
  }

  async searchConversations(query, conversations) {
    const results = [];
    const queryLower = query.toLowerCase();
    
    for (const conversation of conversations) {
      try {
        const content = await readFile(conversation.path, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        let matchCount = 0;
        let totalWords = 0;
        const previews = [];
        
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.content && typeof parsed.content === 'string') {
              const messageContent = parsed.content;
              totalWords += messageContent.split(' ').length;
              
              if (messageContent.toLowerCase().includes(queryLower)) {
                matchCount++;
                if (previews.length < 1) {
                  const words = messageContent.split(' ');
                  const matchIndex = words.findIndex(word => word.toLowerCase().includes(queryLower));
                  if (matchIndex >= 0) {
                    const start = Math.max(0, matchIndex - 15);
                    const end = Math.min(words.length, matchIndex + 20);
                    const contextWords = words.slice(start, end);
                    
                    // Highlight the matching word
                    const highlightedContext = contextWords.map(word => {
                      if (word.toLowerCase().includes(queryLower)) {
                        return `[HIGHLIGHT]${word}[/HIGHLIGHT]`;
                      }
                      return word;
                    }).join(' ');
                    
                    previews.push(highlightedContext);
                  }
                }
              }
            }
          } catch {
            // Skip invalid JSON
          }
        }
        
        if (matchCount > 0) {
          const relevance = Math.min(0.95, (matchCount * 20) / Math.max(totalWords * 0.01, 1));
          results.push({
            file: conversation,
            matches: matchCount,
            preview: previews[0] || 'Match found in conversation',
            relevance: relevance,
            project: conversation.project,
            path: conversation.path,
            modified: conversation.modified
          });
        }
      } catch (error) {
        // Skip unreadable files
      }
    }
    
    return results.sort((a, b) => b.relevance - a.relevance);
  }
}

// Extract the LiveSearchState class for reuse
class LiveSearchState {
  constructor() {
    this.searchTerm = '';
    this.lastSearchTerm = '';
    this.results = [];
    this.selectedIndex = 0;
    this.isSearching = false;
    this.searchTimestamp = 0;
    this.searchDuration = 0;
    this.errorMessage = null;
    this.multiSelectMode = false;
    this.selectedItems = new Set();
    this.terminalSize = { columns: 80, rows: 24 };
    this.activeFilters = {
      repos: new Set(),
      dateRange: null
    };
  }
  
  reset() {
    this.results = [];
    this.selectedIndex = 0;
    this.errorMessage = null;
  }
  
  setSearchResults(results, duration = 0) {
    this.results = results;
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, results.length - 1));
    this.searchDuration = duration;
    this.errorMessage = null;
  }
  
  setError(message) {
    this.errorMessage = message;
    this.results = [];
    this.selectedIndex = 0;
  }
  
  navigateUp() {
    if (this.results.length === 0) return;
    
    if (this.selectedIndex <= 0) {
      // Wrap to last item
      this.selectedIndex = this.results.length - 1;
    } else {
      this.selectedIndex--;
    }
  }
  
  navigateDown() {
    if (this.results.length === 0) return;
    
    if (this.selectedIndex >= this.results.length - 1) {
      // Wrap to first item
      this.selectedIndex = 0;
    } else {
      this.selectedIndex++;
    }
  }
  
  pageUp() {
    if (this.results.length === 0) return;
    
    const pageSize = Math.max(1, Math.floor(this.terminalSize.rows / 3));
    this.selectedIndex = Math.max(0, this.selectedIndex - pageSize);
  }
  
  pageDown() {
    if (this.results.length === 0) return;
    
    const pageSize = Math.max(1, Math.floor(this.terminalSize.rows / 3));
    this.selectedIndex = Math.min(this.results.length - 1, this.selectedIndex + pageSize);
  }
  
  toggleSelection() {
    if (this.results.length === 0 || !this.multiSelectMode) return;
    
    const currentItem = this.results[this.selectedIndex];
    if (!currentItem) return;
    
    const itemId = currentItem.path || currentItem.originalPath || this.selectedIndex;
    if (this.selectedItems.has(itemId)) {
      this.selectedItems.delete(itemId);
    } else {
      this.selectedItems.add(itemId);
    }
  }
  
  getSelectedResult() {
    if (this.results.length === 0 || this.selectedIndex >= this.results.length) {
      return null;
    }
    return this.results[this.selectedIndex];
  }
  
  clearSearch() {
    this.searchTerm = '';
    this.reset();
  }
}

// Enhanced debounce with better testing support
function debounce(func, wait) {
  let timeout;
  let lastArgs;
  let lastCallTime = 0;
  
  const executedFunction = function(...args) {
    lastArgs = args;
    lastCallTime = Date.now();
    
    const later = () => {
      clearTimeout(timeout);
      timeout = null;
      func(...lastArgs);
    };
    
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
  
  // Add flush method to execute immediately
  executedFunction.flush = function() {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
      // Execute if there were any pending calls
      if (lastArgs !== undefined) {
        func(...lastArgs);
        lastArgs = undefined; // Clear to prevent double execution
      }
    }
  };
  
  // Add cancel method
  executedFunction.cancel = function() {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    lastArgs = null;
  };
  
  // Add pending check
  executedFunction.pending = function() {
    return timeout !== null;
  };
  
  return executedFunction;
}

/**
 * Testable CLI class that can be properly mocked and tested
 */
export class TestableCLI extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.projectsDir = options.projectsDir;
    this.conversationsDir = options.conversationsDir;
    this.searchEngine = options.searchEngine;
    this.maxDisplayResults = options.maxDisplayResults || 50;
    
    this.state = new LiveSearchState();
    this.isRunning = false;
    this.extractor = new ClaudeConversationExtractor();
    this.conversations = [];
    
    // Initialize search with debouncing
    this.performSearch = debounce(() => this._doSearch(), 150);
    
    // Create a direct search method for testing
    this.performSearchImmediate = this._doSearch.bind(this);
    
    // UI state
    this.output = [];
    this.lastRender = '';
  }
  
  async start() {
    this.isRunning = true;
    
    try {
      this.conversations = await this.extractor.findConversations();
      this.emit('started', { conversationCount: this.conversations.length });
      this.render();
      return this;
    } catch (error) {
      this.state.setError(error.message);
      this.emit('error', error);
      throw error;
    }
  }
  
  stop() {
    this.isRunning = false;
    if (this.performSearch && typeof this.performSearch.cancel === 'function') {
      this.performSearch.cancel();
    }
    this.emit('stopped');
  }
  
  // Simulate typing input
  async typeInput(text) {
    this.state.searchTerm = text || '';
    this.emit('input', text);
    
    if (this.state.searchTerm.length >= 2) {
      await this.performSearch();
    } else {
      this.state.reset();
      this.render();
    }
  }
  
  // Immediate search for testing
  async searchImmediate(term) {
    if (term !== undefined) {
      this.state.searchTerm = term;
    }
    return await this.performSearchImmediate();
  }

  // Debounced search method for testing
  performSearchDebounced() {
    // Call the debounced search function directly
    this.performSearch();
  }

  // Flush search for testing
  flushSearch() {
    if (this.performSearch && typeof this.performSearch.flush === 'function') {
      this.performSearch.flush();
    }
  }
  
  // Simulate key presses
  pressKey(keyName, options = {}) {
    this.emit('keypress', keyName, options);
    
    switch (keyName) {
    case 'up':
      this.state.navigateUp();
      this.render();
      break;
    case 'down':
      this.state.navigateDown();
      this.render();
      break;
    case 'pageup':
      this.state.pageUp();
      this.render();
      break;
    case 'pagedown':
      this.state.pageDown();
      this.render();
      break;
    case 'escape':
      if (this.state.searchTerm.length > 0) {
        this.state.lastSearchTerm = this.state.searchTerm;
        this.state.clearSearch();
        this.render();
      } else {
        this.stop();
      }
      break;
    case 'return':
      const selected = this.state.getSelectedResult();
      if (selected) {
        this.emit('selection', selected);
      }
      break;
    case 'space':
      if (options.ctrl) {
        this.state.multiSelectMode = !this.state.multiSelectMode;
        if (!this.state.multiSelectMode) {
          this.state.selectedItems.clear();
        }
      } else if (this.state.multiSelectMode) {
        this.state.toggleSelection();
      }
      this.render();
      break;
    case 'c':
      if (options.ctrl) {
        this.stop();
      }
      break;
    }
  }
  
  // Internal search implementation
  async _doSearch() {
    if (this.state.searchTerm.length < 2) return;
    
    this.state.isSearching = true;
    this.emit('searchStart', this.state.searchTerm);
    this.render();
    
    try {
      const startTime = Date.now();
      let searchResults;
      
      if (this.searchEngine) {
        const result = await this.searchEngine.search(this.state.searchTerm);
        searchResults = result.results || result;
      } else {
        searchResults = await this.extractor.searchConversations(this.state.searchTerm, this.conversations);
      }
      
      const duration = Date.now() - startTime;
      
      // Apply filters if any
      const filteredResults = this.applyFilters(searchResults);
      
      this.state.setSearchResults(filteredResults, duration);
      this.state.isSearching = false;
      
      this.emit('searchComplete', {
        query: this.state.searchTerm,
        results: filteredResults,
        duration
      });
      
      this.render();
      
    } catch (error) {
      this.state.setError(error.message);
      this.state.isSearching = false;
      this.emit('searchError', error);
      this.render();
    }
  }
  
  applyFilters(results) {
    let filtered = results;
    
    // Apply repo filter
    if (this.state.activeFilters.repos.size > 0) {
      filtered = filtered.filter(result => {
        const project = result.project || result.file?.project;
        return this.state.activeFilters.repos.has(project);
      });
    }
    
    // Apply date filter if implemented
    // ... date filtering logic
    
    return filtered;
  }
  
  render() {
    this.output = [];
    
    if (!this.isRunning) {
      this.output.push('CLI stopped');
      this.lastRender = this.output.join('\\n');
      this.emit('render', this.lastRender);
      return;
    }
    
    // Header
    this.output.push('┌─ Interactive Conversation Search ─┐');
    this.output.push(`✅ Found ${this.conversations.length} conversations`);
    
    // Search box
    this.output.push('┌─ Search ─────────────────────────┐');
    const searchText = this.state.searchTerm || '';
    const padding = ' '.repeat(Math.max(0, 20 - searchText.length));
    this.output.push(`│ 🔍 Type to search: ${searchText}${padding}│`);
    this.output.push('└──────────────────────────────────┘');
    
    // Error display
    if (this.state.errorMessage) {
      this.output.push(`Error: ${this.state.errorMessage}`);
      this.lastRender = this.output.join('\\n');
      this.emit('render', this.lastRender);
      return;
    }
    
    // Results
    if (this.state.searchTerm.length >= 2) {
      if (this.state.isSearching) {
        this.output.push('Searching...');
      } else if (this.state.results.length === 0) {
        this.output.push('No matches found');
      } else {
        this.output.push(`${this.state.results.length} matches found${this.state.searchDuration > 0 ? ` in ${this.state.searchDuration}ms` : ''}:`);
        
        // Show results (limited for testing)
        const displayResults = this.state.results.slice(0, this.maxDisplayResults);
        displayResults.forEach((result, index) => {
          const isSelected = index === this.state.selectedIndex;
          const cursor = isSelected ? '▶ ' : '  ';
          const project = result.project || result.file?.project || 'Unknown';
          this.output.push(`${cursor}${project}`);
          
          if (isSelected && result.preview) {
            this.output.push(`    ${result.preview.substring(0, 80)}...`);
          }
        });
      }
    } else if (this.state.searchTerm.length > 0) {
      this.output.push('Type at least 2 characters...');
      // Show suggestions for single character
      if (this.state.searchTerm.length === 1) {
        this.output.push('Try: javascript, python, react, api');
      }
    }
    
    // Help
    this.output.push('[↑↓] Navigate  [Enter] Select  [Esc] Clear/Exit');
    
    this.lastRender = this.output.join('\\n');
    this.emit('render', this.lastRender);
  }
  
  getOutput() {
    return this.lastRender;
  }
  
  // Getters for testing
  get selectedIndex() {
    return this.state.selectedIndex;
  }
  
  get searchResults() {
    return this.state.results;
  }
  
  get searchTerm() {
    return this.state.searchTerm;
  }
  
  get isSearching() {
    return this.state.isSearching;
  }
}

export { LiveSearchState, debounce };