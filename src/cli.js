#!/usr/bin/env node

import inquirer from 'inquirer';
import chalk from 'chalk';
import { readdir, stat, readFile, appendFile, writeFile, readFile as readFileSync } from 'fs/promises';
import { join, resolve, isAbsolute } from 'path';
import { homedir } from 'os';
import readline from 'readline';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
import { existsSync } from 'fs';
import { SetupManager } from './setup/setup-manager.js';
import { showSetupMenu, showAnalytics, confirmExportLocation } from './setup/setup-menu.js';
import { BulkExtractor } from './setup/bulk-extractor.js';
import { IndexBuilder } from './setup/index-builder.js';
// Removed IndexedSearch - using only MiniSearch now
import { MiniSearchEngine } from './search/minisearch-engine.js';
import ora from 'ora';
import { getLogger } from './utils/logger.js';
import { 
  DATE_RANGES, 
  DATE_RANGE_LABELS, 
  getDateRange, 
  isDateInRange,
  formatDateRange,
  getRelativeTime,
  formatDate,
  parseCustomDate,
  getDateShortcuts
} from './utils/date-filters.js';

// Vibe-log style colors
const colors = {
  primary: chalk.cyan,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  info: chalk.cyan,
  muted: chalk.hex('#808080'),
  accent: chalk.magenta,
  highlight: chalk.bold.yellow,
  dim: chalk.hex('#606060'),
  subdued: chalk.hex('#909090')
};

// Input validation functions
function sanitizeSearchInput(input) {
  // Allow alphanumeric, spaces, and common punctuation
  // Block potential injection characters
  const sanitized = input.replace(/[<>{}|\\`$]/g, '');
  return sanitized;
}

function sanitizePathInput(input) {
  // Prevent directory traversal attacks
  // Remove dangerous path components
  const sanitized = input
    .replace(/\.\./g, '')  // Remove parent directory references
    .replace(/^~\//g, join(homedir(), '/'))  // Expand home directory
    .replace(/[<>"|?*]/g, '_')  // Replace invalid filename chars
    .replace(/\0/g, '');  // Remove null bytes
  
  // Ensure absolute path or relative to current directory
  if (!isAbsolute(sanitized) && !sanitized.startsWith('./')) {
    return resolve(process.cwd(), sanitized);
  }
  
  return sanitized;
}

function validateDateInput(input) {
  // Validate date format and prevent injection
  const datePattern = /^\d{4}-\d{2}-\d{2}$|^\d{2}\/\d{2}\/\d{4}$/;
  if (!datePattern.test(input.trim())) {
    return null;
  }
  
  // Parse and validate the date
  const parsed = parseCustomDate(input);
  if (!parsed || isNaN(parsed.getTime())) {
    return null;
  }
  
  // Ensure date is within reasonable range (1970 to 10 years from now)
  const minDate = new Date('1970-01-01');
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() + 10);
  
  if (parsed < minDate || parsed > maxDate) {
    return null;
  }
  
  return parsed;
}

/**
 * Copy text to clipboard using platform-specific commands
 * @param {string} text - Text to copy to clipboard
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
async function copyToClipboard(text) {
  try {
    const platform = process.platform;

    if (platform === 'darwin') {
      // macOS - use pbcopy
      await execAsync(`echo ${JSON.stringify(text)} | pbcopy`);
      return true;
    } else if (platform === 'win32') {
      // Windows - use clip
      await execAsync(`echo ${text}| clip`);
      return true;
    } else {
      // Linux - try xclip first, fall back to xsel
      try {
        await execAsync(`echo ${JSON.stringify(text)} | xclip -selection clipboard`);
        return true;
      } catch {
        await execAsync(`echo ${JSON.stringify(text)} | xsel --clipboard`);
        return true;
      }
    }
  } catch (error) {
    return false;
  }
}

// Initialize logger
const logger = getLogger();

// Global error handlers to catch all crashes
process.on('uncaughtException', (error) => {
  logger.errorSyncImmediate('Uncaught Exception', {
    message: error.message,
    stack: error.stack,
    name: error.name
  });
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.errorSyncImmediate('Unhandled Rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    promise: String(promise)
  });
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Debounce function for performance
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
    }
    if (lastArgs) {
      func(...lastArgs);
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

class ClaudeConversationExtractor {
  constructor() {
    this.conversationsPath = join(homedir(), '.claude', 'projects');
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
      console.log(colors.error('❌ Error accessing conversations directory'));
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
        const occurrences = [];
        
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.content && typeof parsed.content === 'string') {
              const messageContent = parsed.content;
              totalWords += messageContent.split(' ').length;
              
              // Find ALL occurrences of the search term
              let searchIndex = 0;
              while (searchIndex < messageContent.length) {
                const matchPos = messageContent.toLowerCase().indexOf(queryLower, searchIndex);
                if (matchPos === -1) break;
                
                matchCount++;
                
                // Extract context around THIS specific match
                const beforeContext = messageContent.substring(Math.max(0, matchPos - 100), matchPos);
                const matchText = messageContent.substring(matchPos, matchPos + queryLower.length);
                const afterContext = messageContent.substring(matchPos + queryLower.length, matchPos + queryLower.length + 100);
                
                // Create highlighted preview with markers
                const preview = beforeContext + '[HIGHLIGHT]' + matchText + '[/HIGHLIGHT]' + afterContext;
                
                occurrences.push({
                  preview: preview,
                  position: matchPos,
                  lineContent: messageContent
                });
                
                searchIndex = matchPos + queryLower.length;
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
            preview: occurrences.length > 0 ? occurrences[0].preview : 'Match found in conversation',
            occurrences: occurrences,
            totalOccurrences: matchCount,
            currentOccurrenceIndex: 0,
            relevance: relevance
          });
        }
      } catch (error) {
        // Skip unreadable files
      }
    }
    
    return results.sort((a, b) => b.relevance - a.relevance);
  }
}

// Live search state management
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
    this.terminalSize = { columns: process.stdout.columns || 80, rows: process.stdout.rows || 24 };
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

// Proper live search interface using readline best practices
async function showLiveSearch(searchInterface = null) {
  const extractor = new ClaudeConversationExtractor();
  let conversations;
  
  try {
    conversations = await extractor.findConversations();
  } catch (error) {
    logger.error('Failed to find conversations:', error);
    console.log(colors.error('❌ Error accessing conversations directory'));
    return null;
  }
  
  if (conversations.length === 0) {
    console.log(colors.error('❌ No Claude conversations found!'));
    return null;
  }
  
  // Try to use MiniSearch if index exists, otherwise fall back to old search
  let miniSearchEngine = null;
  if (!searchInterface) {
    try {
      miniSearchEngine = new MiniSearchEngine();
      const loaded = await miniSearchEngine.loadIndex();
      if (loaded) {
        console.log(colors.dim('  Using MiniSearch with fuzzy matching...'));
        searchInterface = miniSearchEngine;
      }
    } catch (error) {
      // Fall back to old search
    }
  }
  
  return new Promise((resolve) => {
    const state = new LiveSearchState();
    let showFilterMenu = false;
    let searchStartTime = 0;

    // Enter alternate screen buffer (like vim/less) to avoid polluting scrollback
    if (process.stdout.isTTY) {
      process.stdout.write('\u001b[?1049h');
    }

    // Create readline interface
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true
    });

    // Enable keypress events
    readline.emitKeypressEvents(process.stdin, rl);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    
    const displayScreen = async () => {
      // Move cursor to top left and clear screen
      process.stdout.write('\u001b[H\u001b[2J');
      
      // Handle terminal resize
      state.terminalSize = { 
        columns: process.stdout.columns || 80, 
        rows: process.stdout.rows || 24 
      };
      
      // Header with proper box drawing
      const headerWidth = Math.min(state.terminalSize.columns - 4, 60);
      console.log(colors.accent(`
┌${'─'.repeat(headerWidth)}┐`));
      console.log(colors.accent(`│${' '.repeat(Math.floor((headerWidth - 32) / 2))}🔍 Interactive Conversation Search${' '.repeat(Math.ceil((headerWidth - 32) / 2))}│`));
      console.log(colors.accent(`└${'─'.repeat(headerWidth)}┘`));
      
      // Show archive count if using indexed search, otherwise show JSONL count
      const conversationCount = searchInterface ?
        (searchInterface.getStats?.()?.totalConversations || conversations.length) :
        conversations.length;
      const archiveNote = searchInterface && conversationCount > conversations.length * 2 ?
        colors.dim(' (includes historical archive)') : '';
      console.log(colors.success(`✅ Found ${conversationCount} conversations${archiveNote}\n`));
      
      // Display active filters with prominent indicator
      const hasActiveFilters = state.activeFilters.repos.size > 0 || state.activeFilters.dateRange;
      
      if (hasActiveFilters) {
        console.log(colors.accent('┌─ FILTERS ACTIVE ─────────────────┐'));
        
        // Show repo filter if active
        if (state.activeFilters.repos.size > 0) {
          const repoList = Array.from(state.activeFilters.repos);
          const displayRepos = repoList.length > 3 
            ? repoList.slice(0, 3).join(', ') + `, +${repoList.length - 3} more`
            : repoList.join(', ');
          console.log(colors.highlight('│ 📁 Repos: ' + displayRepos));
        }
        
        // Show date filter if active
        if (state.activeFilters.dateRange) {
          const dateDisplay = formatDateRange(state.activeFilters.dateRange.type, state.activeFilters.dateRange.custom);
          console.log(colors.highlight('│ 📅 Date: ' + dateDisplay));
        }
        
        console.log(colors.accent('└─ Press [Tab] to modify ──────────┘\n'));
      } else {
        console.log(colors.dim('  No filters active [Press Tab to filter]\n'));
      }
      
      // Search input with enhanced features
      const searchInputWidth = Math.min(state.terminalSize.columns - 4, 80);
      const searchBox = `┌─ Search ${state.multiSelectMode ? '(Multi-select)' : ''} ${'─'.repeat(Math.max(0, searchInputWidth - 20))}┐`;
      console.log(colors.primary(searchBox));
      
      const queryTerms = state.searchTerm.trim().split(/\s+/).filter(t => t.length > 2);
      let searchPrompt = '│ 🔍 ';
      
      if (state.multiSelectMode) {
        searchPrompt += `Multi-select (${state.selectedItems.size} selected): `;
      } else if (queryTerms.length > 1) {
        searchPrompt += 'Search (ALL terms required): ';
      } else {
        searchPrompt += 'Type to search: ';
      }
      
      const searchContent = state.searchTerm || '';
      const paddedContent = searchContent + ' '.repeat(Math.max(0, searchInputWidth - searchContent.length - searchPrompt.length - 2));
      console.log(colors.primary(searchPrompt) + colors.highlight(paddedContent) + colors.primary('│'));
      
      // Show last search if different from current
      if (state.lastSearchTerm && state.lastSearchTerm !== state.searchTerm) {
        console.log(colors.dim(`│ Last: ${state.lastSearchTerm}${' '.repeat(Math.max(0, searchInputWidth - state.lastSearchTerm.length - 8))}│`));
      }
      
      console.log(colors.primary(`└${'─'.repeat(searchInputWidth)}┘`));
      
      // Error display
      if (state.errorMessage) {
        console.log(colors.error(`\n❌ Error: ${state.errorMessage}`));
        console.log(colors.dim('  Press [Esc] to clear or try again\n'));
        return;
      }
      
      // Results
      if (state.searchTerm.length >= 2) {
        if (state.isSearching) {
          const elapsed = Date.now() - searchStartTime;
          const dots = '.'.repeat((Math.floor(elapsed / 300) % 4));
          console.log(colors.info(`\n🔎 Searching${dots} (${elapsed}ms)`));
        } else if (state.results.length === 0) {
          console.log(colors.warning('\n❌ No matches found'));
          if (state.activeFilters.repos.size > 0) {
            console.log(colors.dim('  (Try clearing filters with [Tab] if too restrictive)'));
          }
          if (state.searchTerm.length < 3) {
            console.log(colors.dim('  (Try longer search terms for better results)'));
          }
        } else {
          // Show result count with timing and filter context
          let resultText = `\n📋 ${state.results.length} matches found`;
          if (state.searchDuration > 0) {
            resultText += colors.dim(` in ${state.searchDuration}ms`);
          }
          if (state.activeFilters.repos.size > 0) {
            resultText += colors.dim(` (filtered)`);
          }
          console.log(colors.info(resultText + ':\n'));
          
          // Calculate scrolling window based on terminal size
          const windowSize = Math.max(3, Math.min(10, Math.floor(state.terminalSize.rows / 4)));
          let windowStart = 0;
          
          // Adjust window to keep selected item visible
          if (state.selectedIndex >= windowStart + windowSize) {
            windowStart = state.selectedIndex - windowSize + 1;
          } else if (state.selectedIndex < windowStart) {
            windowStart = state.selectedIndex;
          }
          
          // Ensure window doesn't go past the end
          if (windowStart + windowSize > state.results.length) {
            windowStart = Math.max(0, state.results.length - windowSize);
          }
          
          // Show results in the current window with enhanced display
          state.results.slice(windowStart, windowStart + windowSize).forEach((result, index) => {
            const actualIndex = windowStart + index;
            const isSelected = actualIndex === state.selectedIndex;
            const isMultiSelected = state.multiSelectMode && state.selectedItems.has(result.path || result.originalPath || actualIndex);
            // Handle both basic search (result.file) and indexed search (direct properties)
            const modified = result.file?.modified || (result.modified ? new Date(result.modified) : new Date());
            const dateDisplay = formatDate(modified, false);
            const relativeTime = getRelativeTime(modified);
            const project = (result.file?.project || result.project || '').slice(0, 30);
            const relevance = Math.max(1, Math.round(result.relevance * 100));
            
            let cursor = '  ';
            if (isSelected && isMultiSelected) {
              cursor = colors.accent('▶✓');
            } else if (isSelected) {
              cursor = colors.accent('▶ ');
            } else if (isMultiSelected) {
              cursor = colors.success('✓ ');
            }
            
            // Truncate long project names to fit terminal
            const maxProjectWidth = Math.max(20, Math.floor(state.terminalSize.columns * 0.3));
            const truncatedProject = project.length > maxProjectWidth 
              ? project.substring(0, maxProjectWidth - 3) + '...'
              : project;
            
            const resultLine = `${cursor}${colors.dim(relativeTime)} ${colors.accent('│')} ${colors.primary(truncatedProject)} ${colors.accent('│')} ${colors.success(relevance + '%')}`;
            console.log(resultLine);
            
            if (isSelected && result.preview) {
              // Show more context for selected item with word wrapping and highlighting
              const preview = result.preview;
              const maxWidth = 135;
              
              // Function to render text with highlights
              const renderWithHighlights = (text) => {
                // Replace [HIGHLIGHT]...[/HIGHLIGHT] with colored text
                return text.replace(/\[HIGHLIGHT\](.*?)\[\/HIGHLIGHT\]/g, (match, p1) => {
                  return colors.highlight(p1);
                });
              };
              
              // Split preview into words while preserving highlight markers
              const words = preview.split(' ');
              let currentLine = '';
              
              // Show occurrence counter if there are multiple matches
              let contextHeader = 'Context:';
              if (result.totalOccurrences && result.totalOccurrences > 1) {
                const currentMatch = (result.currentOccurrenceIndex || 0) + 1;
                // Now we can navigate through ALL occurrences
                contextHeader = `Context: Match ${currentMatch}/${result.totalOccurrences} ${colors.dim('[←→ navigate]')}`;
              } else if (result.totalOccurrences === 1) {
                contextHeader = 'Context: Match 1/1';
              }
              
              console.log(colors.subdued('    ┌─ ' + contextHeader));
              
              for (const word of words) {
                // Calculate actual display length (without highlight markers)
                const displayWord = word.replace(/\[HIGHLIGHT\]/g, '').replace(/\[\/HIGHLIGHT\]/g, '');
                const displayLine = currentLine.replace(/\[HIGHLIGHT\]/g, '').replace(/\[\/HIGHLIGHT\]/g, '');
                
                if ((displayLine + displayWord).length > maxWidth) {
                  // Render and print the current line
                  const renderedLine = renderWithHighlights(currentLine.trim());
                  console.log(colors.subdued('    │ ') + renderedLine);
                  currentLine = word + ' ';
                } else {
                  currentLine += word + ' ';
                }
              }
              
              if (currentLine.trim()) {
                const renderedLine = renderWithHighlights(currentLine.trim());
                console.log(colors.subdued('    │ ') + renderedLine);
              }
              console.log(colors.subdued('    └─'));
            }
          });
          
          if (state.results.length > windowSize) {
            // Show position indicator with scroll hints
            const scrollHints = [];
            if (windowStart > 0) scrollHints.push('↑ More above');
            if (windowStart + windowSize < state.results.length) scrollHints.push('↓ More below');
            
            const positionText = `Showing ${windowStart + 1}-${Math.min(windowStart + windowSize, state.results.length)} of ${state.results.length}`;
            const hintsText = scrollHints.length > 0 ? ` (${scrollHints.join(', ')})` : '';
            
            console.log(colors.dim(`\n${positionText}${hintsText}`));
          }
        }
      } else if (state.searchTerm.length > 0) {
        console.log(colors.dim('\nType at least 2 characters...'));
        // Show auto-completion suggestions
        if (state.searchTerm.length === 1 && conversations.length > 0) {
          const suggestions = getSearchSuggestions(state.searchTerm, conversations);
          if (suggestions.length > 0) {
            console.log(colors.dim('  Try: ' + suggestions.slice(0, 3).join(', ')));
          }
        }
      } else {
        // Show filtered conversations when no search term
        // If we have an indexed archive, show all indexed conversations instead of just JSONL files
        let conversationsToShow = conversations;
        const hasArchive = searchInterface &&
                           searchInterface.conversationData &&
                           searchInterface.conversationData.size > conversations.length * 2;

        if (hasArchive) {
          // Use the indexed archive
          conversationsToShow = Array.from(searchInterface.conversationData.values())
            .map(conv => ({
              project: conv.project,
              modified: conv.modified ? new Date(conv.modified) : new Date(),
              name: conv.project,
              path: conv.originalPath || conv.exportedFile,
              preview: '',
              relevance: 1.0
            }))
            .sort((a, b) => b.modified.getTime() - a.modified.getTime());
        }

        const filteredConversations = applyFilters(conversationsToShow.map(conv => ({
          ...conv,
          name: conv.project,
          preview: '',
          relevance: 1.0
        })), state.activeFilters);

        if (filteredConversations.length > 0) {
          // Show total from archive or from conversations
          const totalAvailable = hasArchive ? searchInterface.conversationData.size : conversationsToShow.length;
          const isFiltered = filteredConversations.length < totalAvailable || state.activeFilters.repos.size > 0;

          let countDisplay;
          if (isFiltered) {
            countDisplay = `${filteredConversations.length} of ${totalAvailable} conversations (filtered)`;
          } else {
            countDisplay = `${totalAvailable} conversation${totalAvailable > 1 ? 's' : ''}`;
          }
          console.log(colors.info(`\n📋 Showing ${countDisplay}:\n`));
          
          // Calculate scrolling window for conversations
          const windowSize = 10;
          let windowStart = 0;
          
          // Adjust window to keep selected item visible
          if (state.selectedIndex >= windowStart + windowSize) {
            windowStart = state.selectedIndex - windowSize + 1;
          } else if (state.selectedIndex < windowStart) {
            windowStart = state.selectedIndex;
          }
          
          // Ensure window doesn't go past the end
          if (windowStart + windowSize > filteredConversations.length) {
            windowStart = Math.max(0, filteredConversations.length - windowSize);
          }
          
          // Show filtered conversations in the current window
          for (let index = 0; index < Math.min(windowSize, filteredConversations.length - windowStart); index++) {
            const conv = filteredConversations[windowStart + index];
            const actualIndex = windowStart + index;
            const isSelected = actualIndex === state.selectedIndex;
            const modified = conv.modified || new Date();
            const relativeTime = getRelativeTime(modified);
            const project = (conv.project || '').slice(0, 50);

            const cursor = isSelected ? colors.accent('▶ ') : '  ';
            const resultLine = `${cursor}${colors.dim(relativeTime)} ${colors.accent('│')} ${colors.primary(project)}`;
            console.log(resultLine);

            // Show preview for selected conversation
            if (isSelected) {
              // Use preview from index if available, otherwise read file
              let preview = conv.preview || '';

              // If no preview in index, try to read from file
              if (!preview && (conv.exportedFile || conv.originalPath || conv.path)) {
                const filePath = conv.exportedFile || conv.originalPath || conv.path;
                try {
                  const content = await readFile(filePath, 'utf-8');
                  const lines = content.split('\n');

                  // Extract first meaningful content (skip metadata)
                  for (const line of lines) {
                    if (line.startsWith('## 👤') || line.startsWith('## 🤖')) {
                      // Start capturing content
                      const contentStart = lines.indexOf(line) + 1;
                      const contentLines = lines.slice(contentStart, contentStart + 10).join(' ');
                      preview = contentLines.replace(/\s+/g, ' ').slice(0, 135).trim();
                      break;
                    }
                  }
                } catch {
                  // Skip preview if file can't be read
                }
              }

              if (preview) {
                console.log(colors.subdued('    ┌─ Preview'));
                const words = preview.split(' ');
                let currentLine = '';
                for (const word of words) {
                  if ((currentLine + word).length > 135) {
                    console.log(colors.subdued('    │ ') + currentLine.trim());
                    currentLine = word + ' ';
                  } else {
                    currentLine += word + ' ';
                  }
                }
                if (currentLine.trim()) {
                  console.log(colors.subdued('    │ ') + currentLine.trim());
                }
                console.log(colors.subdued('    └─'));
              }
            }
          }
          
          if (filteredConversations.length > windowSize) {
            // Show position indicator
            if (windowStart > 0 && windowStart + windowSize < filteredConversations.length) {
              console.log(colors.dim(`\n... showing ${windowStart + 1}-${windowStart + windowSize} of ${filteredConversations.length} conversations ...`));
            } else if (windowStart > 0) {
              console.log(colors.dim(`\n... showing ${windowStart + 1}-${filteredConversations.length} of ${filteredConversations.length} conversations (end)`));
            } else if (filteredConversations.length > windowSize) {
              console.log(colors.dim(`\n... ${filteredConversations.length - windowSize} more conversations ...`));
            }
          }
          
          // Update results for navigation
          state.setSearchResults(filteredConversations);
        } else if (state.activeFilters.repos.size > 0) {
          console.log(colors.warning('\n❌ No conversations match the current filter'));
          console.log(colors.dim('  Press [Tab] to modify or clear filters'));
        } else {
          console.log(colors.dim('\nStart typing to search conversations...'));
        }
      }
      
      // Enhanced help text
      const helpLines = [
        '[↑↓] Navigate  [PgUp/PgDn] Page  [←→] Switch matches',
        '[Tab] Filter  [Space] Multi-select  [Enter] Select  [Esc] Clear/Exit',
        '[Ctrl+C] Exit  [F1] Help'
      ];
      
      console.log(colors.dim('\n' + helpLines.join('\n')));
      
      if (state.multiSelectMode && state.selectedItems.size > 0) {
        console.log(colors.success(`\n✓ ${state.selectedItems.size} items selected for batch operation`));
      }
    };
    
    // Helper function to get search suggestions
    const getSearchSuggestions = (partial, conversations) => {
      const suggestions = new Set();
      const partialLower = partial.toLowerCase();
      
      conversations.forEach(conv => {
        if (conv.project && conv.project.toLowerCase().startsWith(partialLower)) {
          suggestions.add(conv.project);
        }
      });
      
      // Add common programming terms
      const commonTerms = ['javascript', 'python', 'react', 'node', 'api', 'database', 'error', 'function'];
      commonTerms.forEach(term => {
        if (term.startsWith(partialLower)) {
          suggestions.add(term);
        }
      });
      
      return Array.from(suggestions).slice(0, 5);
    };
    
    // Get all unique repos from conversations
    const getAllRepos = () => {
      const repos = new Set();
      conversations.forEach(conv => {
        if (conv.project) {
          repos.add(conv.project);
        }
      });
      return Array.from(repos).sort();
    };
    
    // Show filter menu
    const showFilterOptions = async () => {
      try {
        // Clear screen and show filter menu
        process.stdout.write('\u001b[H\u001b[2J');
        console.log(colors.accent('\n🔧 Filter Options\n'));
        
        const filterTypes = [
          { name: '📁 Filter by Repository', value: 'repo' },
          { name: '📅 Filter by Date Range', value: 'date' },
          { name: '🧹 Clear All Filters', value: 'clear' },
          { name: '← Back to Search', value: 'back' }
        ];
        
        // Temporarily disable raw mode for inquirer
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        
        const { filterType } = await inquirer.prompt([{
          type: 'list',
          name: 'filterType',
          message: 'Choose filter type:',
          choices: filterTypes.filter(f => !f.disabled)
        }]);
        
        logger.debugSync('Filter menu: type selected', { filterType });

        // Small delay to ensure stdin is ready for next prompt
        await new Promise(resolve => setTimeout(resolve, 100));

        if (filterType === 'repo') {
          logger.debugSync('Opening repo filter, current filters', { count: state.activeFilters.repos.size });
          await showRepoFilter();
          logger.infoSync('Repo filter applied', {
            count: state.activeFilters.repos.size,
            repos: Array.from(state.activeFilters.repos)
          });
        } else if (filterType === 'date') {
          await showDateFilter();
        } else if (filterType === 'clear') {
          logger.infoSync('Clearing all filters');
          state.activeFilters.repos.clear();
          state.activeFilters.dateRange = null;
        }
        
        // Re-enable raw mode and ensure readline is ready
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(true);
        }
        // Ensure stdin is resumed
        process.stdin.resume();

        logger.debugSync('Before refresh', { searchTermLength: state.searchTerm.length, activeFilters: state.activeFilters.repos.size });

        // Refresh search or display with new filters
        if (state.searchTerm.length >= 2) {
          // Force immediate search with new filters
          performSearch.flush();
        } else {
          // Force refresh of display to show filtered results
          state.selectedIndex = 0;
          await displayScreen();
        }
        
        return filterType !== 'back';
      } catch (error) {
        console.error('Filter menu error:', error);
        // Ensure we restore raw mode even on error
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(true);
        }
        process.stdin.resume();
        return false;
      }
    };
    
    // Show repo filter selection
    const showRepoFilter = async () => {
      try {
        const allRepos = getAllRepos();

        if (allRepos.length === 0) {
          console.log(colors.warning('No repositories found'));
          return;
        }

        console.log(colors.primary('\n📁 Select Repositories to Filter:\n'));
        console.log(colors.dim('(Use space to select, Enter to confirm)\n'));

        // Ensure stdin is in the right mode for inquirer
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }

        const { selectedRepos } = await inquirer.prompt([{
          type: 'checkbox',
          name: 'selectedRepos',
          message: 'Select repositories:',
          choices: allRepos.map(repo => ({
            name: repo,
            value: repo,
            checked: state.activeFilters.repos.has(repo)
          })),
          pageSize: 15
        }]);
        
        // Update active filters
        logger.debugSync('Repos selected in menu', { count: selectedRepos.length, repos: selectedRepos });
        state.activeFilters.repos.clear();
        selectedRepos.forEach(repo => state.activeFilters.repos.add(repo));
        logger.infoSync('Active filters updated', { count: state.activeFilters.repos.size, repos: Array.from(state.activeFilters.repos) });
        
        console.log(colors.success(`\n✓ Filtering by ${selectedRepos.length} repository(s)`));
        
      } catch (error) {
        console.error('Repo filter error:', error);
        // Don't crash, just return to search
      }
    };
    
    // Show date filter selection
    const showDateFilter = async () => {
      try {
        // Need to import dayjs for date operations
        const dayjs = (await import('dayjs')).default;
        
        // Prepare date range choices
        const dateChoices = Object.entries(DATE_RANGE_LABELS).map(([value, label]) => ({
          name: label,
          value: value
        }));
        
        // Ask for date range type
        const { dateRangeType } = await inquirer.prompt([{
          type: 'list',
          name: 'dateRangeType',
          message: 'Select date range:',
          choices: dateChoices,
          pageSize: 15
        }]);
        
        // Handle custom date range
        if (dateRangeType === DATE_RANGES.CUSTOM) {
          // Show shortcuts for quick date selection
          const shortcuts = getDateShortcuts();
          
          // Ask for start date
          const { fromInput } = await inquirer.prompt([{
            type: 'input',
            name: 'fromInput',
            message: 'Enter start date (YYYY-MM-DD or MM/DD/YYYY):',
            validate: (input) => {
              if (!input) return 'Start date is required';
              const parsed = parseCustomDate(input);
              if (!parsed) return 'Invalid date format';
              return true;
            },
            transformer: (input) => {
              // Show parsed date preview
              const parsed = parseCustomDate(input);
              if (parsed) {
                return `${input} (${formatDate(parsed, false)})`;
              }
              return input;
            }
          }]);
          
          // Ask for end date
          const { toInput } = await inquirer.prompt([{
            type: 'input',
            name: 'toInput',
            message: 'Enter end date (YYYY-MM-DD or MM/DD/YYYY):',
            default: () => {
              // Default to today
              return dayjs().format('YYYY-MM-DD');
            },
            validate: (input) => {
              if (!input) return 'End date is required';
              const parsed = parseCustomDate(input);
              if (!parsed) return 'Invalid date format';
              
              // Check if end date is after start date
              const fromDate = parseCustomDate(fromInput);
              if (fromDate && parsed < fromDate) {
                return 'End date must be after start date';
              }
              return true;
            },
            transformer: (input) => {
              // Show parsed date preview
              const parsed = parseCustomDate(input);
              if (parsed) {
                return `${input} (${formatDate(parsed, false)})`;
              }
              return input;
            }
          }]);
          
          // Parse and set custom range
          const fromDate = parseCustomDate(fromInput);
          const toDate = parseCustomDate(toInput);
          
          state.activeFilters.dateRange = {
            type: DATE_RANGES.CUSTOM,
            custom: { from: fromDate, to: toDate }
          };
          
          console.log(colors.success(`\n✓ Filtering from ${formatDate(fromDate, false)} to ${formatDate(toDate, false)}`));
          
        } else if (dateRangeType) {
          // Set predefined date range
          state.activeFilters.dateRange = {
            type: dateRangeType,
            custom: null
          };
          
          const range = getDateRange(dateRangeType);
          console.log(colors.success(`\n✓ Filtering by ${DATE_RANGE_LABELS[dateRangeType]}`));
          console.log(colors.dim(`  From: ${formatDate(range.from)}`));
          console.log(colors.dim(`  To: ${formatDate(range.to)}`));
        } else {
          // Clear date filter
          state.activeFilters.dateRange = null;
          console.log(colors.success('\n✓ Date filter cleared'));
        }
        
      } catch (error) {
        console.error('Date filter error:', error);
        // Don't crash, just return to search
      }
    };
    
    // Apply filters to results
    const applyFilters = (searchResults, filters) => {
      logger.debug('applyFilters called', { 
        inputCount: searchResults.length, 
        activeFilterCount: filters.repos.size,
        hasDateFilter: !!filters.dateRange
      });
      
      let filtered = searchResults;
      
      // Apply repo filter
      if (filters.repos.size > 0) {
        filtered = filtered.filter(result => {
          const project = result.project || result.file?.project;
          return filters.repos.has(project);
        });
      }
      
      // Apply date filter
      if (filters.dateRange) {
        const dateRange = getDateRange(
          filters.dateRange.type, 
          filters.dateRange.custom
        );
        
        filtered = filtered.filter(result => {
          const modified = result.modified || result.file?.modified;
          if (!modified) return false;
          const date = modified instanceof Date ? modified : new Date(modified);
          return isDateInRange(date, dateRange);
        });
      }
      
      logger.info('Filters applied', { 
        before: searchResults.length, 
        after: filtered.length,
        activeRepos: Array.from(filters.repos),
        dateFilter: filters.dateRange?.type
      });
      
      return filtered;
    };
    
    // Debounced search to prevent excessive API calls
    const performSearch = debounce(async () => {
      if (state.searchTerm.length >= 2) {
        logger.debugSync('performSearch called', { searchTerm: state.searchTerm, hasInterface: !!searchInterface });
        state.isSearching = true;
        searchStartTime = Date.now();
        await displayScreen();
        
        try {
          // Use indexed search if available, otherwise fall back to basic search
          let searchResults;
          const startTime = Date.now();
          
          if (searchInterface) {
            const searchResult = await searchInterface.search(state.searchTerm);
            logger.debugSync('Search completed', { 
              totalFound: searchResult?.totalFound,
              hasResults: !!searchResult?.results 
            });
            
            // Ensure searchResult has the expected structure
            if (searchResult && searchResult.results && Array.isArray(searchResult.results)) {
              searchResults = searchResult.results.map(r => ({
                ...r,
                name: r.exportedFile ? r.exportedFile.split('/').pop() : 'conversation.jsonl',
                path: r.originalPath,
                size: 0, // Size not tracked in index
                preview: r.preview  // Keep highlight markers for display
              }));
            } else {
              // If search result is malformed, treat as no results
              searchResults = [];
              logger.debugSync('Search returned invalid format', { searchResult });
            }
          } else {
            searchResults = await extractor.searchConversations(state.searchTerm, conversations);
          }
          
          const searchDuration = Date.now() - startTime;
          logger.debugSync('Before applyFilters', { resultCount: searchResults.length });
          
          // Apply active filters
          const filteredResults = applyFilters(searchResults, state.activeFilters);
          state.setSearchResults(filteredResults, searchDuration);
          
          logger.debugSync('After applyFilters', { resultCount: state.results.length });
        } catch (error) {
          logger.errorSync('Search error', { 
            message: error.message, 
            stack: error.stack 
          });
          state.setError(error.message || 'Search failed');
        }
        
        state.isSearching = false;
        await displayScreen();
      }
    }, 150);
    
    const handleKeypress = async (str, key) => {
      // Handle Ctrl+C for clean exit
      if (key && key.ctrl && key.name === 'c') {
        cleanup();
        console.log(colors.dim('\nGoodbye! 👋'));
        process.exit(0);
      }
      
      // Handle Escape key - clear search or exit
      if (key && key.name === 'escape') {
        if (state.searchTerm.length > 0) {
          // Clear search first
          state.lastSearchTerm = state.searchTerm;
          state.clearSearch();
          performSearch.cancel();
          await displayScreen();
        } else {
          // Exit if no search term
          cleanup();
          resolve(null);
        }
      } else if (key && key.name === 'return') {
        if (state.multiSelectMode && state.selectedItems.size > 0) {
          // Handle multi-select return
          cleanup();
          const selectedFiles = [];
          for (const itemId of state.selectedItems) {
            const result = state.results.find(r => (r.path || r.originalPath || state.results.indexOf(r)) === itemId);
            if (result) {
              selectedFiles.push(createFileObject(result));
            }
          }
          resolve(selectedFiles.length === 1 ? selectedFiles[0] : selectedFiles);
        } else if (state.results.length > 0 && state.selectedIndex < state.results.length) {
          // Handle single selection
          cleanup();
          const selected = state.results[state.selectedIndex];
          resolve(createFileObject(selected));
        }
      } else if (key && key.name === 'up') {
        state.navigateUp();
        await displayScreen();
      } else if (key && key.name === 'down') {
        state.navigateDown();
        await displayScreen();
      } else if (key && key.name === 'pageup') {
        state.pageUp();
        await displayScreen();
      } else if (key && key.name === 'pagedown') {
        state.pageDown();
        await displayScreen();
      } else if (key && key.name === 'right') {
        // Navigate to next occurrence in selected conversation
        if (state.results.length > 0 && state.selectedIndex < state.results.length) {
          const result = state.results[state.selectedIndex];
          if (result.occurrences && result.occurrences.length > 1) {
            // Move to next occurrence
            result.currentOccurrenceIndex = (result.currentOccurrenceIndex + 1) % result.occurrences.length;
            
            // Update the preview to show the current occurrence
            result.preview = result.occurrences[result.currentOccurrenceIndex].preview;
            
            await displayScreen();
          }
        }
      } else if (key && key.name === 'left') {
        // Navigate to previous occurrence in selected conversation
        if (state.results.length > 0 && state.selectedIndex < state.results.length) {
          const result = state.results[state.selectedIndex];
          if (result.occurrences && result.occurrences.length > 1) {
            // Move to previous occurrence
            result.currentOccurrenceIndex = (result.currentOccurrenceIndex - 1 + result.occurrences.length) % result.occurrences.length;
            
            // Update the preview to show the current occurrence
            result.preview = result.occurrences[result.currentOccurrenceIndex].preview;
            
            await displayScreen();
          }
        }
      } else if (key && key.name === 'tab') {
        // Open filter menu with Tab key
        try {
          // Pause keypress handling
          process.stdin.removeListener('keypress', handleKeypress);
          
          // Show filter options
          await showFilterOptions();
          
          // Resume keypress handling
          process.stdin.on('keypress', handleKeypress);
          
          // Redraw the screen
          await displayScreen();
        } catch (error) {
          console.error('Error in filter menu:', error);
          // Make sure to re-attach the listener even on error
          process.stdin.on('keypress', handleKeypress);
          await displayScreen();
        }
      } else if (key && key.name === 'space') {
        // Toggle multi-select mode or select item
        if (key.ctrl) {
          // Ctrl+Space toggles multi-select mode
          state.multiSelectMode = !state.multiSelectMode;
          if (!state.multiSelectMode) {
            state.selectedItems.clear();
          }
          await displayScreen();
        } else if (state.multiSelectMode) {
          // Space selects/deselects current item
          state.toggleSelection();
          await displayScreen();
        } else {
          // Regular space character in search
          const sanitizedChar = sanitizeSearchInput(' ');
          if (sanitizedChar) {
            state.searchTerm += sanitizedChar;
            await displayScreen();
            if (state.searchTerm.length >= 2) {
              performSearch();
            }
          }
        }
      } else if (key && (key.name === 'f1' || (key.name === 'f' && key.shift))) {
        // Show help
        showHelp();
        await displayScreen();
      } else if (key && key.name === 'backspace') {
        state.searchTerm = state.searchTerm.slice(0, -1);
        if (state.searchTerm.length >= 2) {
          performSearch();
        } else {
          state.reset();
          await displayScreen();
        }
      } else if (str && str.length === 1 && str.charCodeAt(0) >= 32) {
        // Handle regular character input
        try {
          const sanitizedChar = sanitizeSearchInput(str);
          if (sanitizedChar) {
            state.searchTerm += sanitizedChar;
            await displayScreen();
            if (state.searchTerm.length >= 2) {
              performSearch();
            }
          }
        } catch (error) {
          // Ignore invalid characters
          logger.debugSync('Invalid character input', { char: str, code: str.charCodeAt(0) });
        }
      } else if (key && key.name && !['shift', 'ctrl', 'alt', 'meta'].includes(key.name)) {
        // Handle function keys and other special keys without crashing
        logger.debugSync('Unhandled key', { name: key.name, ctrl: key.ctrl, shift: key.shift });
        // Show brief key hint for unknown keys
        if (key.name.startsWith('f') && key.name.length <= 3) {
          console.log(colors.dim('\n[Function keys not supported - Press F1 for help]'));
          setTimeout(async () => await displayScreen(), 1000);
        }
      }
    };
    
    // Helper function to create file object from search result
    const createFileObject = (result) => {
      return result.file || {
        project: result.project,
        name: result.name || result.exportedFile?.split('/').pop() || 'conversation.jsonl',
        path: result.path || result.originalPath,
        modified: result.modified ? new Date(result.modified) : new Date(),
        size: result.size || 0
      };
    };
    
    // Helper function to show help
    const showHelp = () => {
      console.clear();
      console.log(colors.accent(`
┌─ Claude Conversation Search - Help ─────────────────────┐`));
      console.log(colors.primary('│                                                                   │'));
      console.log(colors.primary('│ 🔍 SEARCH:                                                         │'));
      console.log(colors.primary('│   Type to search conversation content                            │'));
      console.log(colors.primary('│   Use quotes for exact phrases: "error message"                  │'));
      console.log(colors.primary('│   Use OR for alternatives: javascript OR python                  │'));
      console.log(colors.primary('│                                                                   │'));
      console.log(colors.primary('│ ⌨️ NAVIGATION:                                                      │'));
      console.log(colors.primary('│   ↑↓ Arrow keys - Navigate results                               │'));
      console.log(colors.primary('│   PgUp/PgDn - Page through results                               │'));
      console.log(colors.primary('│   ←→ Left/Right - Switch between match occurrences               │'));
      console.log(colors.primary('│                                                                   │'));
      console.log(colors.primary('│ ⚙️ ACTIONS:                                                         │'));
      console.log(colors.primary('│   Enter - Select conversation                                    │'));
      console.log(colors.primary('│   Tab - Open filter menu                                         │'));
      console.log(colors.primary('│   Space - Select item (in multi-select mode)                    │'));
      console.log(colors.primary('│   Ctrl+Space - Toggle multi-select mode                          │'));
      console.log(colors.primary('│   Esc - Clear search or exit                                     │'));
      console.log(colors.primary('│   Ctrl+C - Exit immediately                                      │'));
      console.log(colors.primary('│                                                                   │'));
      console.log(colors.accent(`└───────────────────────────────────────────────────────────────────┘`));
      console.log(colors.dim('\nPress any key to continue...'));
    };
    
    // Handle terminal resize
    const handleResize = () => {
      state.terminalSize = { 
        columns: process.stdout.columns || 80, 
        rows: process.stdout.rows || 24 
      };
      // Debounce redraw to avoid excessive updates
      clearTimeout(state.resizeTimeout);
      state.resizeTimeout = setTimeout(async () => {
        await displayScreen();
      }, 100);
    };
    
    const cleanup = () => {
      // Exit alternate screen buffer to restore normal terminal
      if (process.stdout.isTTY) {
        process.stdout.write('\u001b[?1049l');
      }

      process.stdin.removeListener('keypress', handleKeypress);
      process.stdout.removeListener('resize', handleResize);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      rl.close();
      performSearch.cancel();
      if (state.resizeTimeout) {
        clearTimeout(state.resizeTimeout);
      }
    };
    
    // Set up event listeners
    process.stdin.on('keypress', handleKeypress);
    process.stdout.on('resize', handleResize);
    
    // Handle process exit gracefully
    process.on('SIGINT', () => {
      cleanup();
      console.log(colors.dim('\nGoodbye! 👋'));
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      cleanup();
      process.exit(0);
    });
    
    // Initial display
    displayScreen();
  });
}

async function exportConversation(conversation) {
  try {
    // Choose export location
    const { exportLocation } = await inquirer.prompt([
      {
        type: 'list',
        name: 'exportLocation',
        message: 'Where would you like to export the conversation?',
        choices: [
          { name: '📁 ~/.claude/claude_conversations/', value: join(homedir(), '.claude', 'claude_conversations') },
          { name: '📁 ~/Desktop/claude_conversations/', value: join(homedir(), 'Desktop', 'claude_conversations') },
          { name: '📁 Current directory', value: process.cwd() },
          { name: '📁 Custom location', value: 'custom' }
        ]
      }
    ]);
    
    let outputDir = exportLocation;
    if (exportLocation === 'custom') {
      const { customPath } = await inquirer.prompt([
        {
          type: 'input',
          name: 'customPath',
          message: 'Enter custom export path:',
          validate: (input) => {
            // Validate and sanitize the custom path
            const sanitized = sanitizePathInput(input);
            if (!sanitized || sanitized.length === 0) {
              return 'Please enter a valid directory path';
            }
            return true;
          },
          filter: (input) => {
            // Return the sanitized path
            return sanitizePathInput(input);
          }
        }
      ]);
      outputDir = customPath;  // Already sanitized by filter
    }
    
    // Create directory if it doesn't exist
    await require('fs').promises.mkdir(outputDir, { recursive: true });
    
    // Read and convert conversation
    const content = await readFile(conversation.path, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    
    let markdown = '# Claude Conversation\n\n';
    markdown += `**Project:** ${conversation.project}\n`;
    markdown += `**Date:** ${conversation.modified.toLocaleString()}\n`;
    markdown += `**File:** ${conversation.name}\n\n`;
    markdown += '---\n\n';
    
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.content && typeof parsed.content === 'string') {
          const speaker = parsed.speaker || 'unknown';
          const messageContent = parsed.content;
          
          if (speaker === 'human') {
            markdown += `## 👤 Human\n\n${messageContent}\n\n`;
          } else if (speaker === 'assistant') {
            markdown += `## 🤖 Assistant\n\n${messageContent}\n\n`;
          } else {
            markdown += `## ${speaker}\n\n${messageContent}\n\n`;
          }
        }
      } catch {
        // Skip invalid JSON lines
      }
    }
    
    // Save the file
    const fileName = `${conversation.project}_${conversation.modified.toISOString().slice(0, 10)}.md`;
    const outputPath = join(outputDir, fileName);
    await require('fs').promises.writeFile(outputPath, markdown);
    
    console.log(colors.success('\n📤 Conversation exported successfully!'));
    console.log(colors.highlight(`📄 File: ${outputPath}`));
    console.log(colors.dim(`📊 Size: ${(markdown.length / 1024).toFixed(1)} KB`));
    
  } catch (error) {
    console.log(colors.error(`❌ Export failed: ${error.message}`));
  }
  
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
}

async function createClaudeContext(conversation) {
  const spinner = ora('Creating Claude Code context...').start();

  try {
    // Read and parse the conversation
    const content = await readFile(conversation.path, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    // Extract essential conversation messages
    const messages = [];
    let messageCount = 0;
    const maxMessages = 50; // Limit to recent messages for context

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.content && typeof parsed.content === 'string') {
          const speaker = parsed.speaker || 'unknown';
          const messageContent = parsed.content;

          // Only include human and assistant messages (skip system messages)
          if (speaker === 'human' || speaker === 'assistant') {
            messages.push({
              speaker,
              content: messageContent,
              timestamp: parsed.timestamp || null
            });
            messageCount++;
          }
        }
      } catch {
        // Skip invalid JSON
      }
    }

    spinner.text = 'Formatting conversation...';

    // Take the most recent messages if there are too many
    const recentMessages = messages.slice(-maxMessages);

    // Format as clean markdown
    let markdown = `# Context from Claude Conversation\n\n`;
    markdown += `**Project:** ${conversation.project}\n`;
    markdown += `**Date:** ${conversation.modified.toLocaleString()}\n`;
    markdown += `**Messages:** ${recentMessages.length} (most recent)\n\n`;
    markdown += `---\n\n`;

    for (const msg of recentMessages) {
      if (msg.speaker === 'human') {
        markdown += `## 👤 User\n\n${msg.content}\n\n`;
      } else if (msg.speaker === 'assistant') {
        markdown += `## 🤖 Claude\n\n${msg.content}\n\n`;
      }
    }

    // Add instructions at the end
    markdown += `---\n\n`;
    markdown += `*This conversation context was extracted from Claude Code conversation history.*\n`;
    markdown += `*Use this as context to continue the conversation or understand previous work.*\n`;

    spinner.text = 'Saving context file...';

    // Save to current directory with sanitized project name
    const sanitizedProject = conversation.project.replace(/[^a-z0-9-_]/gi, '_');
    const timestamp = new Date().toISOString().slice(0, 10);
    const contextPath = join(process.cwd(), `claude-context-${sanitizedProject}-${timestamp}.md`);

    await writeFile(contextPath, markdown);

    spinner.succeed('Context file created!');

    console.log(colors.success(`\n🚀 Claude Code context created!\n`));
    console.log(colors.info(`📄 File: ${colors.highlight(contextPath)}`));
    console.log(colors.dim(`📊 ${recentMessages.length} messages extracted\n`));

    // Ask if user wants to launch Claude Code with this context
    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: '🚀 Launch Claude Code with this context', value: 'launch' },
        { name: '📋 Copy file path to clipboard', value: 'copy' },
        { name: '👀 View file location', value: 'view' },
        { name: '← Back to conversation menu', value: 'back' }
      ]
    }]);

    if (action === 'launch') {
      console.log(colors.info('\n🚀 Launching Claude Code...\n'));
      console.log(colors.dim('The context file will be opened in your editor.'));
      console.log(colors.dim('You can reference it in your conversation with Claude Code.\n'));

      try {
        // Launch Claude Code in the current directory
        await execAsync(`claude ${contextPath}`);
        console.log(colors.success('\n✅ Claude Code launched!\n'));
      } catch (error) {
        console.log(colors.warning('\n⚠️  Could not launch Claude Code automatically'));
        console.log(colors.dim('You can manually run:'));
        console.log(colors.highlight(`  claude ${contextPath}\n`));
      }

      // Exit the conversation extractor since we're launching Claude Code
      process.exit(0);
    } else if (action === 'copy') {
      const success = await copyToClipboard(contextPath);
      if (success) {
        console.log(colors.success('\n📋 File path copied to clipboard!'));
      } else {
        console.log(colors.warning('\n⚠️  Could not copy to clipboard'));
        console.log(colors.info(`Path: ${contextPath}`));
      }
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter...' }]);
      await showConversationActions(conversation);
    } else if (action === 'view') {
      console.log(colors.info(`\n📂 Context file location:`));
      console.log(colors.highlight(contextPath));
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter...' }]);
      await showConversationActions(conversation);
    } else {
      await showConversationActions(conversation);
    }

  } catch (error) {
    spinner.fail('Failed to create context');
    console.log(colors.error(`\n❌ Error: ${error.message}`));
    logger.errorSync('Context creation failed', { error: error.message, stack: error.stack });
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter...' }]);
    await showConversationActions(conversation);
  }
}

async function showConversationActions(conversation) {
  console.clear();

  // Get actual file size if not in conversation object
  let fileSize = conversation.size || 0;
  if (fileSize === 0) {
    const filePath = conversation.path || conversation.exportedFile || conversation.originalPath;
    if (filePath) {
      try {
        const fileStat = await stat(filePath);
        fileSize = fileStat.size;
      } catch {
        // Keep 0 if we can't read the file
      }
    }
  }

  console.log(colors.primary('\n📄 Conversation Details\n'));
  console.log(colors.dim(`Project: ${conversation.project}`));
  console.log(colors.dim(`File: ${conversation.name}`));
  console.log(colors.dim(`Modified: ${conversation.modified.toLocaleString()}`));
  console.log(colors.dim(`Size: ${(fileSize / 1024).toFixed(1)} KB\n`));
  
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: '📤 Export to markdown', value: 'export' },
        { name: '📋 Copy file path', value: 'copy' },
        { name: '📂 Show file location', value: 'location' },
        { name: '📝 Create Claude Code context', value: 'context' },
        new inquirer.Separator(),
        { name: '🔙 Back to search', value: 'back' },
        { name: '🚪 Exit', value: 'exit' }
      ]
    }
  ]);
  
  switch (action) {
  case 'export':
    await exportConversation(conversation);
    await showConversationActions(conversation);
    break;
      
  case 'copy':
    {
      const success = await copyToClipboard(conversation.path);
      if (success) {
        console.log(colors.success('\n📋 File path copied to clipboard!'));
        console.log(colors.dim(`Path: ${conversation.path}`));
      } else {
        console.log(colors.warning('\n⚠️  Could not copy to clipboard automatically'));
        console.log(colors.info('File path:'));
        console.log(colors.highlight(conversation.path));
        console.log(colors.dim('\nPlease copy manually (select and Cmd+C / Ctrl+C)'));
      }
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter...' }]);
      await showConversationActions(conversation);
    }
    break;
      
  case 'location':
    console.log(colors.info(`\n📂 Location:\n${colors.highlight(conversation.path)}`));
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter...' }]);
    await showConversationActions(conversation);
    break;
      
  case 'context':
    await createClaudeContext(conversation);
    break;
      
  case 'back':
    const selected = await showLiveSearch();
    if (selected) {
      await showConversationActions(selected);
    }
    break;
      
  case 'exit':
    console.log(colors.dim('\nGoodbye! 👋'));
    process.exit(0);
  }
}

async function main() {
  console.clear();
  
  logger.infoSync('Claude Conversation Extractor started');
  
  // Initialize setup manager
  const setupManager = new SetupManager();
  const status = await setupManager.getSetupStatus();
  logger.debugSync('Setup status', { 
    extractComplete: status.extractComplete, 
    indexBuilt: status.indexBuilt,
    totalConversations: status.totalConversations 
  });
  
  // Check if index-based search is available
  let searchInterface = null;
  
  // Show setup menu if needed
  if (status.isFirstTime || status.needsSetup) {
    const setupChoice = await showSetupMenu(status);
    
    switch (setupChoice) {
    case 'quick_setup':
      // Extract all conversations
      if (status.needsExtraction) {
        const extractor = new BulkExtractor();
        await extractor.extractAllConversations(status.conversations, status.exportLocation);
        await setupManager.markExtractComplete(status.conversations.length);
      }
        
      // Build search index
      if (status.needsIndexing) {
        const indexBuilder = new IndexBuilder();
        await indexBuilder.buildSearchIndex(status.conversations, status.exportLocation);
        await setupManager.markIndexComplete(status.conversations.length);
      }
        
      await setupManager.markSetupComplete();
      // Load MiniSearch index
      const miniSearch = new MiniSearchEngine();
      const loaded = await miniSearch.loadIndex();
      if (loaded) {
        searchInterface = miniSearch;
      }
      break;
        
    case 'extract_only':
      const extractor = new BulkExtractor();
      await extractor.extractAllConversations(status.conversations, status.exportLocation);
      await setupManager.markExtractComplete(status.conversations.length);
      break;
        
    case 'index_only':
      const indexBuilder = new IndexBuilder();
      await indexBuilder.buildSearchIndex(status.conversations, status.exportLocation);
      await setupManager.markIndexComplete(status.conversations.length);
      // Load MiniSearch index
      const miniSearchIdx = new MiniSearchEngine();
      const indexLoaded = await miniSearchIdx.loadIndex();
      if (indexLoaded) {
        searchInterface = miniSearchIdx;
      }
      break;
        
    case 'change_location':
      const newLocation = await confirmExportLocation();
      await setupManager.updateExportLocation(newLocation);
      // Re-run main to show updated menu
      return main();
        
    case 'view_analytics':
      await showAnalytics(status);
      // Re-run main to return to menu
      return main();

    case 'skip_setup':
      // User chose to start searching - load the existing index
      {
        console.log('\n');
        const loadingSpinner = ora({
          text: 'Reading 261 MB search index...',
          spinner: 'dots'
        }).start();

        // Show elapsed time during load
        const startTime = Date.now();
        const timerInterval = setInterval(() => {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          loadingSpinner.text = `Reading 261 MB search index... ${elapsed}s`;
        }, 100);

        const miniSearchForSkip = new MiniSearchEngine();
        const skipLoaded = await miniSearchForSkip.loadIndex();

        clearInterval(timerInterval);

        if (skipLoaded) {
          searchInterface = miniSearchForSkip;
          const count = miniSearchForSkip.getStats().totalConversations;
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          loadingSpinner.succeed(`Loaded ${count} conversations in ${elapsed}s! 🚀`);
        } else {
          loadingSpinner.fail('Failed to load index');
        }

        await new Promise(resolve => setTimeout(resolve, 400));
      }
      break;

    case 'exit':
      console.log(colors.dim('\nGoodbye! 👋'));
      process.exit(0);
    }
  }

  // Only check/build index if searchInterface wasn't already set by setup menu
  let indexLoaded = !!searchInterface; // If searchInterface is set, index is already loaded
  let needsRebuild = false;

  if (!searchInterface) {
    // Always try to use MiniSearch - build index if needed
    const miniSearch = new MiniSearchEngine();

    try {
      indexLoaded = await miniSearch.loadIndex();
      if (indexLoaded) {
        // Check if index is stale
        needsRebuild = await miniSearch.needsRebuild();

        if (needsRebuild) {
          console.log(colors.warning('\n⚠️  Search index is outdated due to new conversations\n'));
          indexLoaded = false; // Force rebuild
        } else {
          searchInterface = miniSearch;
          console.log(colors.success('⚡ Using indexed search (fast mode)\n'));
        }
      }
    } catch (error) {
      console.error(colors.error('Failed to load search index:', error.message));
    }
  }

  // If no index exists or it needs rebuilding, build it automatically
  if (!indexLoaded) {
    const miniSearch = searchInterface || new MiniSearchEngine();
    const message = needsRebuild 
      ? '\n🔄 Rebuilding search index with latest conversations...'
      : '\n📦 First-time setup: Building search index for optimal performance...';
    
    console.log(colors.info(message));
    console.log(colors.dim('This takes about 30 seconds.\n'));
    
    const spinner = ora('Building search index...').start();
    
    try {
      // Build the index
      const buildStats = await miniSearch.buildIndex();
      await miniSearch.saveIndex();

      // Mark index as complete in setup manager with ACTUAL indexed count
      const actualIndexed = buildStats.totalDocuments || buildStats.totalConversations || status.conversations.length;
      await setupManager.markIndexComplete(actualIndexed);

      spinner.succeed('Search index built successfully!');
      searchInterface = miniSearch;
      console.log(colors.success('\n⚡ Search is now optimized (20ms response time)\n'));
    } catch (error) {
      spinner.fail('Failed to build search index');
      console.error(colors.error('Error:', error.message));
      console.log(colors.warning('\n⚠️  Falling back to basic search (slower)\n'));
    }
  }

  // Launch search interface
  const selectedConversation = await showLiveSearch(searchInterface);
  if (selectedConversation) {
    await showConversationActions(selectedConversation);
  } else {
    console.log(colors.dim('\nGoodbye! 👋'));
  }
}

// Export for testing
export { showLiveSearch };

// Run main if this is the entry point or if called via symlink
if (import.meta.url === `file://${process.argv[1]}` || 
    import.meta.url === `file://${process.argv[1].replace(/^\/opt\/homebrew/, '/usr/local')}` ||
    process.argv[1].includes('claude-logs') ||
    process.argv[1].endsWith('/cli.js')) {
  main().catch(error => {
    logger.errorSyncImmediate('Application crashed', { 
      message: error.message, 
      stack: error.stack,
      name: error.name 
    });
    console.error(error);
    process.exit(1);
  });
}