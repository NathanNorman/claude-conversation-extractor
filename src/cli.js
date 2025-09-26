#!/usr/bin/env node

import inquirer from 'inquirer';
import chalk from 'chalk';
import { readdir, stat, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import readline from 'readline';
import { SetupManager } from './setup/setup-manager.js';
import { showSetupMenu, showAnalytics, confirmExportLocation } from './setup/setup-menu.js';
import { BulkExtractor } from './setup/bulk-extractor.js';
import { IndexBuilder } from './setup/index-builder.js';
// Removed IndexedSearch - using only MiniSearch now
import { MiniSearchEngine } from './search/minisearch-engine.js';

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


// Debounce function for performance
function debounce(func, wait) {
  let timeout;
  let lastArgs;
  
  const executedFunction = function(...args) {
    lastArgs = args;
    const later = () => {
      clearTimeout(timeout);
      func(...lastArgs);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
  
  // Add flush method to execute immediately
  executedFunction.flush = function() {
    clearTimeout(timeout);
    if (lastArgs) {
      func(...lastArgs);
    }
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
        
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.content && typeof parsed.content === 'string') {
              const messageContent = parsed.content;
              totalWords += messageContent.split(' ').length;
              
              if (messageContent.toLowerCase().includes(queryLower)) {
                matchCount++;
                if (previews.length < 1) {
                  // Find larger context around the match
                  const words = messageContent.split(' ');
                  const matchIndex = words.findIndex(word => word.toLowerCase().includes(queryLower));
                  if (matchIndex >= 0) {
                    const start = Math.max(0, matchIndex - 15);
                    const end = Math.min(words.length, matchIndex + 20);
                    const contextWords = words.slice(start, end);
                    
                    // Highlight the matching word
                    const highlightedContext = contextWords.map(word => {
                      if (word.toLowerCase().includes(queryLower)) {
                        return chalk.yellow.bold(word);
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

// Proper live search interface using readline best practices
async function showLiveSearch(searchInterface = null) {
  const extractor = new ClaudeConversationExtractor();
  const conversations = await extractor.findConversations();
  
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
    let searchTerm = '';
    let results = [];
    let selectedIndex = 0;
    let isSearching = false;
    let activeFilters = {
      repos: new Set(),  // Empty set means all repos
      dateRange: null,   // Future: { from: Date, to: Date }
    };
    let showFilterMenu = false;
    
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
      
      // Header
      console.log(colors.accent(`
 ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗
██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝
██║     ██║     ███████║██║   ██║██║  ██║█████╗  
██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝  
╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗
 ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝`));
      
      console.log(colors.primary('        🔍 Interactive Conversation Search'));
      console.log(colors.success(`✅ Found ${conversations.length} conversations\n`));
      
      // Display active filters with prominent indicator
      if (activeFilters.repos.size > 0) {
        const repoCount = activeFilters.repos.size;
        const repoList = Array.from(activeFilters.repos);
        const displayRepos = repoList.length > 3 
          ? repoList.slice(0, 3).join(', ') + `, +${repoList.length - 3} more`
          : repoList.join(', ');
        
        // Prominent filter indicator box
        console.log(chalk.bgMagenta.white.bold(' FILTER ACTIVE ') + ' ' + 
                    colors.accent(`Showing only ${repoCount} repo${repoCount > 1 ? 's' : ''}:`));
        console.log(colors.highlight('  📁 ' + displayRepos));
        console.log(colors.dim('  Press [Tab] to modify or clear filters\n'));
      } else {
        // Show that no filters are active
        console.log(colors.dim('  No filters active - showing all repos [Press Tab to filter]\n'));
      }
      
      // Search input with multi-term indicator
      const queryTerms = searchTerm.trim().split(/\s+/).filter(t => t.length > 2);
      if (queryTerms.length > 1) {
        console.log(colors.primary('🔍 Type to search (ALL terms required): ') + colors.highlight(searchTerm) + colors.dim('│'));
      } else {
        console.log(colors.primary('🔍 Type to search: ') + colors.highlight(searchTerm) + colors.dim('│'));
      }
      
      // Results
      if (searchTerm.length >= 2) {
        if (isSearching) {
          console.log(colors.info('\n🔎 Searching...'));
        } else if (results.length === 0) {
          console.log(colors.warning('\n❌ No matches found'));
          if (activeFilters.repos.size > 0) {
            console.log(colors.dim('  (Try clearing filters with [f] if too restrictive)'));
          }
        } else {
          // Show result count with filter context
          let resultText = `\n📋 ${results.length} matches found`;
          if (activeFilters.repos.size > 0) {
            resultText += colors.dim(` (filtered)`);
          }
          console.log(colors.info(resultText + ':\n'));
          
          // Calculate scrolling window
          const windowSize = 5;
          let windowStart = 0;
          
          // Adjust window to keep selected item visible
          if (selectedIndex >= windowStart + windowSize) {
            windowStart = selectedIndex - windowSize + 1;
          } else if (selectedIndex < windowStart) {
            windowStart = selectedIndex;
          }
          
          // Ensure window doesn't go past the end
          if (windowStart + windowSize > results.length) {
            windowStart = Math.max(0, results.length - windowSize);
          }
          
          // Show results in the current window
          results.slice(windowStart, windowStart + windowSize).forEach((result, index) => {
            const actualIndex = windowStart + index;
            const isSelected = actualIndex === selectedIndex;
            // Handle both basic search (result.file) and indexed search (direct properties)
            const modified = result.file?.modified || (result.modified ? new Date(result.modified) : new Date());
            const date = modified.toLocaleDateString();
            const time = modified.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const project = (result.file?.project || result.project || '').slice(0, 30);
            const relevance = Math.max(1, Math.round(result.relevance * 100));
            
            const cursor = isSelected ? colors.accent('▶ ') : '  ';
            const resultLine = `${cursor}${colors.dim(date + ' ' + time)} ${colors.accent('│')} ${colors.primary(project)} ${colors.accent('│')} ${colors.success(relevance + '%')}`;
            console.log(resultLine);
            
            if (isSelected && result.preview) {
              // Show more context for selected item with word wrapping and highlighting
              const preview = result.preview;
              const maxWidth = 90;
              
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
          
          if (results.length > windowSize) {
            // Show position indicator
            if (windowStart > 0 && windowStart + windowSize < results.length) {
              console.log(colors.dim(`\n... showing ${windowStart + 1}-${windowStart + windowSize} of ${results.length} results ...`));
            } else if (windowStart > 0) {
              console.log(colors.dim(`\n... showing ${windowStart + 1}-${results.length} of ${results.length} results (end)`));
            } else if (results.length > windowSize) {
              console.log(colors.dim(`\n... ${results.length - windowSize} more results ...`));
            }
          }
        }
      } else if (searchTerm.length > 0) {
        console.log(colors.dim('\nType at least 2 characters...'));
      } else {
        // Show filtered conversations when no search term
        const filteredConversations = applyFilters(conversations.map(conv => ({
          ...conv,
          name: conv.project,
          preview: '',
          relevance: 1.0
        })));
        
        if (filteredConversations.length > 0) {
          console.log(colors.info(`\n📋 Showing ${filteredConversations.length} conversation${filteredConversations.length > 1 ? 's' : ''}${activeFilters.repos.size > 0 ? ' (filtered)' : ''}:\n`));
          
          // Calculate scrolling window for conversations
          const windowSize = 5;
          let windowStart = 0;
          
          // Adjust window to keep selected item visible
          if (selectedIndex >= windowStart + windowSize) {
            windowStart = selectedIndex - windowSize + 1;
          } else if (selectedIndex < windowStart) {
            windowStart = selectedIndex;
          }
          
          // Ensure window doesn't go past the end
          if (windowStart + windowSize > filteredConversations.length) {
            windowStart = Math.max(0, filteredConversations.length - windowSize);
          }
          
          // Show filtered conversations in the current window
          filteredConversations.slice(windowStart, windowStart + windowSize).forEach((conv, index) => {
            const actualIndex = windowStart + index;
            const isSelected = actualIndex === selectedIndex;
            const modified = conv.modified || new Date();
            const date = modified.toLocaleDateString();
            const time = modified.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const project = (conv.project || '').slice(0, 50);
            
            const cursor = isSelected ? colors.accent('▶ ') : '  ';
            const resultLine = `${cursor}${colors.dim(date + ' ' + time)} ${colors.accent('│')} ${colors.primary(project)}`;
            console.log(resultLine);
          });
          
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
          results = filteredConversations;
        } else if (activeFilters.repos.size > 0) {
          console.log(colors.warning('\n❌ No conversations match the current filter'));
          console.log(colors.dim('  Press [Tab] to modify or clear filters'));
        } else {
          console.log(colors.dim('\nStart typing to search conversations...'));
        }
      }
      
      console.log(colors.dim('\n[↑↓] Navigate  [←→] Switch matches  [Tab] Filter  [Enter] Select  [Esc] Exit'));
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
          { name: '📅 Filter by Date Range (coming soon)', value: 'date', disabled: true },
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
        
        if (filterType === 'repo') {
          await showRepoFilter();
        } else if (filterType === 'clear') {
          activeFilters.repos.clear();
          activeFilters.dateRange = null;
        }
        
        // Re-enable raw mode and ensure readline is ready
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(true);
        }
        // Ensure stdin is resumed
        process.stdin.resume();
        
        // Refresh search or display with new filters
        if (searchTerm.length >= 2) {
          // Force immediate search with new filters
          isSearching = true;
          await displayScreen();
          
          try {
            let searchResults;
            if (searchInterface) {
              const searchResult = await searchInterface.search(searchTerm);
              searchResults = searchResult.results.map(r => ({
                ...r,
                name: r.exportedFile ? r.exportedFile.split('/').pop() : 'conversation.jsonl',
                path: r.originalPath,
                size: 0,
                preview: r.preview
              }));
            } else {
              searchResults = await extractor.searchConversations(searchTerm, conversations);
            }
            
            // Apply active filters
            results = applyFilters(searchResults);
            selectedIndex = 0;
          } catch (error) {
            results = [];
            console.error('Search error:', error);
          }
          
          isSearching = false;
          await displayScreen();
        } else {
          // Force refresh of display to show filtered results
          selectedIndex = 0;
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
        
        const { selectedRepos } = await inquirer.prompt([{
          type: 'checkbox',
          name: 'selectedRepos',
          message: 'Select repositories:',
          choices: allRepos.map(repo => ({
            name: repo,
            value: repo,
            checked: activeFilters.repos.has(repo)
          })),
          pageSize: 15
        }]);
        
        // Update active filters
        activeFilters.repos.clear();
        selectedRepos.forEach(repo => activeFilters.repos.add(repo));
        
        console.log(colors.success(`\n✓ Filtering by ${selectedRepos.length} repository(s)`));
        
      } catch (error) {
        console.error('Repo filter error:', error);
        // Don't crash, just return to search
      }
    };
    
    // Apply filters to results
    const applyFilters = (searchResults) => {
      if (activeFilters.repos.size === 0) {
        return searchResults;
      }
      
      return searchResults.filter(result => {
        const project = result.project || result.file?.project;
        return activeFilters.repos.has(project);
      });
    };
    
    // Debounced search to prevent excessive API calls
    const performSearch = debounce(async () => {
      if (searchTerm.length >= 2) {
        isSearching = true;
        await displayScreen();
        
        try {
          // Use indexed search if available, otherwise fall back to basic search
          let searchResults;
          if (searchInterface) {
            const searchResult = await searchInterface.search(searchTerm);
            searchResults = searchResult.results.map(r => ({
              ...r,
              name: r.exportedFile ? r.exportedFile.split('/').pop() : 'conversation.jsonl',
              path: r.originalPath,
              size: 0, // Size not tracked in index
              preview: r.preview  // Keep highlight markers for display
            }));
          } else {
            searchResults = await extractor.searchConversations(searchTerm, conversations);
          }
          
          // Apply active filters
          results = applyFilters(searchResults);
          selectedIndex = 0;
        } catch (error) {
          results = [];
          console.error('Search error:', error);
        }
        
        isSearching = false;
        await displayScreen();
      }
    }, 150);
    
    const handleKeypress = async (str, key) => {
      if (key && key.name === 'escape') {
        cleanup();
        resolve(null);
      } else if (key && key.name === 'return') {
        if (results.length > 0 && selectedIndex < results.length) {
          cleanup();
          // Handle both basic search (result.file) and indexed search (create file object)
          const selected = results[selectedIndex];
          const fileObject = selected.file || {
            project: selected.project,
            name: selected.name || selected.exportedFile?.split('/').pop() || 'conversation.jsonl',
            path: selected.path || selected.originalPath,
            modified: selected.modified ? new Date(selected.modified) : new Date(),
            size: selected.size || 0
          };
          resolve(fileObject);
        }
      } else if (key && key.name === 'up') {
        if (results.length > 0) {
          selectedIndex = Math.max(0, selectedIndex - 1);
          await displayScreen();
        }
      } else if (key && key.name === 'down') {
        if (results.length > 0) {
          selectedIndex = Math.min(results.length - 1, selectedIndex + 1);
          await displayScreen();
        }
      } else if (key && key.name === 'right') {
        // Navigate to next occurrence in selected conversation
        if (results.length > 0 && selectedIndex < results.length) {
          const result = results[selectedIndex];
          if (result.occurrences && result.occurrences.length > 1) {
            // Move to next occurrence
            result.currentOccurrenceIndex = (result.currentOccurrenceIndex + 1) % result.occurrences.length;
            
            // Generate preview for this occurrence on-demand
            const occurrence = result.occurrences[result.currentOccurrenceIndex];
            const contextSize = 100;
            const start = Math.max(0, occurrence.index - contextSize);
            const end = Math.min(result.fullText.length, occurrence.index + occurrence.length + contextSize);
            
            let preview = result.fullText.substring(start, end).trim();
            if (start > 0) preview = '...' + preview;
            if (end < result.fullText.length) preview = preview + '...';
            
            // Highlight matching words and phrases
            for (const word of result.queryWords || []) {
              const highlightRegex = new RegExp(`\\b(${word}\\w*)`, 'gi');
              preview = preview.replace(highlightRegex, (match) => `[HIGHLIGHT]${match}[/HIGHLIGHT]`);
            }
            for (const phrase of result.queryPhrases || []) {
              const highlightRegex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
              preview = preview.replace(highlightRegex, (match) => `[HIGHLIGHT]${match}[/HIGHLIGHT]`);
            }
            
            result.preview = preview;
            await displayScreen();
          }
        }
      } else if (key && key.name === 'left') {
        // Navigate to previous occurrence in selected conversation
        if (results.length > 0 && selectedIndex < results.length) {
          const result = results[selectedIndex];
          if (result.occurrences && result.occurrences.length > 1) {
            // Move to previous occurrence
            result.currentOccurrenceIndex = (result.currentOccurrenceIndex - 1 + result.occurrences.length) % result.occurrences.length;
            
            // Generate preview for this occurrence on-demand
            const occurrence = result.occurrences[result.currentOccurrenceIndex];
            const contextSize = 100;
            const start = Math.max(0, occurrence.index - contextSize);
            const end = Math.min(result.fullText.length, occurrence.index + occurrence.length + contextSize);
            
            let preview = result.fullText.substring(start, end).trim();
            if (start > 0) preview = '...' + preview;
            if (end < result.fullText.length) preview = preview + '...';
            
            // Highlight matching words and phrases
            for (const word of result.queryWords || []) {
              const highlightRegex = new RegExp(`\\b(${word}\\w*)`, 'gi');
              preview = preview.replace(highlightRegex, (match) => `[HIGHLIGHT]${match}[/HIGHLIGHT]`);
            }
            for (const phrase of result.queryPhrases || []) {
              const highlightRegex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
              preview = preview.replace(highlightRegex, (match) => `[HIGHLIGHT]${match}[/HIGHLIGHT]`);
            }
            
            result.preview = preview;
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
      } else if (key && key.name === 'backspace') {
        searchTerm = searchTerm.slice(0, -1);
        selectedIndex = 0;
        if (searchTerm.length >= 2) {
          performSearch();
        } else {
          results = [];
          await displayScreen();
        }
      } else if (str && str.length === 1 && str.charCodeAt(0) >= 32) {
        searchTerm += str;
        selectedIndex = 0;
        await displayScreen();
        if (searchTerm.length >= 2) {
          performSearch();
        }
      }
    };
    
    const cleanup = () => {
      process.stdin.removeListener('keypress', handleKeypress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      rl.close();
    };
    
    // Set up event listener
    process.stdin.on('keypress', handleKeypress);
    
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
          validate: (input) => input.trim().length > 0 || 'Please enter a valid path'
        }
      ]);
      outputDir = customPath.replace('~', homedir());
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

async function showConversationActions(conversation) {
  console.clear();
  
  console.log(colors.primary('\n📄 Conversation Details\n'));
  console.log(colors.dim(`Project: ${conversation.project}`));
  console.log(colors.dim(`File: ${conversation.name}`));
  console.log(colors.dim(`Modified: ${conversation.modified.toLocaleString()}`));
  console.log(colors.dim(`Size: ${(conversation.size / 1024).toFixed(1)} KB\n`));
  
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
    console.log(colors.success(`\n📋 File path:\n${colors.highlight(conversation.path)}`));
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter...' }]);
    await showConversationActions(conversation);
    break;
      
  case 'location':
    console.log(colors.info(`\n📂 Location:\n${colors.highlight(conversation.path)}`));
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter...' }]);
    await showConversationActions(conversation);
    break;
      
  case 'context':
    try {
      const content = await readFile(conversation.path, 'utf-8');
      const contextPath = join(process.cwd(), `claude-context-${conversation.project}.md`);
      await require('fs').promises.writeFile(contextPath, `# Claude Context\n\n**Project:** ${conversation.project}\n**File:** ${conversation.name}\n\n---\n\n${content}`);
      console.log(colors.success(`\n🚀 Context file created:\n${colors.highlight(contextPath)}`));
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter...' }]);
      await showConversationActions(conversation);
    } catch (error) {
      console.log(colors.error('❌ Error creating context file'));
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter...' }]);
      await showConversationActions(conversation);
    }
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
  
  // Initialize setup manager
  const setupManager = new SetupManager();
  const status = await setupManager.getSetupStatus();
  
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
      console.log(colors.warning('\n⚠️  Using basic search mode (slower)\n'));
      await new Promise(resolve => setTimeout(resolve, 1500));
      break;
        
    case 'exit':
      console.log(colors.dim('\nGoodbye! 👋'));
      process.exit(0);
    }
  }
  
  // Check again if we have index after setup
  if (!searchInterface && status.indexBuilt) {
    // Try to load MiniSearch
    try {
      const miniSearch = new MiniSearchEngine();
      const loaded = await miniSearch.loadIndex();
      if (loaded) {
        searchInterface = miniSearch;
      }
    } catch (error) {
      console.error(colors.error('Failed to load search index:', error.message));
    }
  }
  
  // Show search mode indicator
  if (searchInterface) {
    console.log(colors.success('⚡ Using indexed search (fast mode)\n'));
  } else {
    console.log(colors.warning('🐢 Using basic search (consider running setup for 25x faster searches)\n'));
  }
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
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
  main().catch(console.error);
}