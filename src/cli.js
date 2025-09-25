#!/usr/bin/env node

import inquirer from 'inquirer';
import chalk from 'chalk';
import { readdir, stat, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import readline from 'readline';

// Vibe-log style colors
const colors = {
  primary: chalk.cyan,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  info: chalk.cyan,
  muted: chalk.hex('#808080'),
  accent: chalk.magenta,
  highlight: chalk.bold.white,
  dim: chalk.hex('#606060'),
  subdued: chalk.hex('#909090')
};

// Debounce function for performance
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
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
async function showLiveSearch() {
  const extractor = new ClaudeConversationExtractor();
  const conversations = await extractor.findConversations();
  
  if (conversations.length === 0) {
    console.log(colors.error('❌ No Claude conversations found!'));
    return null;
  }
  
  return new Promise((resolve) => {
    let searchTerm = '';
    let results = [];
    let selectedIndex = 0;
    let isSearching = false;
    
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
      
      // Search input
      console.log(colors.primary('🔍 Type to search: ') + colors.highlight(searchTerm) + colors.dim('│'));
      
      // Results
      if (searchTerm.length >= 2) {
        if (isSearching) {
          console.log(colors.info('\n🔎 Searching...'));
        } else if (results.length === 0) {
          console.log(colors.warning('\n❌ No matches found'));
        } else {
          console.log(colors.info(`\n📋 ${results.length} matches found:\n`));
          
          // Show top 5 results
          results.slice(0, 5).forEach((result, index) => {
            const isSelected = index === selectedIndex;
            const date = result.file.modified.toLocaleDateString();
            const time = result.file.modified.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const project = result.file.project.slice(0, 30);
            const relevance = Math.max(1, Math.round(result.relevance * 100));
            
            const cursor = isSelected ? colors.accent('▶ ') : '  ';
            const resultLine = `${cursor}${colors.dim(date + ' ' + time)} ${colors.accent('│')} ${colors.primary(project)} ${colors.accent('│')} ${colors.success(relevance + '%')}`;
            console.log(resultLine);
            
            if (isSelected && result.preview) {
              // Show more context for selected item with word wrapping
              const preview = result.preview;
              const maxWidth = 90;
              const words = preview.split(' ');
              let currentLine = '';
              
              console.log(colors.subdued('    ┌─ Context:'));
              for (const word of words) {
                if ((currentLine + word).length > maxWidth) {
                  console.log(colors.subdued(`    │ ${currentLine.trim()}`));
                  currentLine = word + ' ';
                } else {
                  currentLine += word + ' ';
                }
              }
              if (currentLine.trim()) {
                console.log(colors.subdued(`    │ ${currentLine.trim()}`));
              }
              console.log(colors.subdued('    └─'));
            }
          });
          
          if (results.length > 5) {
            console.log(colors.dim(`\n... ${results.length - 5} more results`));
          }
        }
      } else if (searchTerm.length > 0) {
        console.log(colors.dim('\nType at least 2 characters...'));
      } else {
        console.log(colors.dim('\nStart typing to search conversations...'));
      }
      
      console.log(colors.dim('\n[↑↓] Navigate  [Enter] Select  [Esc] Exit'));
    };
    
    // Debounced search to prevent excessive API calls
    const performSearch = debounce(async () => {
      if (searchTerm.length >= 2) {
        isSearching = true;
        await displayScreen();
        
        try {
          results = await extractor.searchConversations(searchTerm, conversations);
          selectedIndex = 0;
        } catch (error) {
          results = [];
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
          resolve(results[selectedIndex].file);
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
          { name: `📁 ~/.claude/claude_conversations/`, value: join(homedir(), '.claude', 'claude_conversations') },
          { name: `📁 ~/Desktop/claude_conversations/`, value: join(homedir(), 'Desktop', 'claude_conversations') },
          { name: `📁 Current directory`, value: process.cwd() },
          { name: `📁 Custom location`, value: 'custom' }
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
    
    let markdown = `# Claude Conversation\n\n`;
    markdown += `**Project:** ${conversation.project}\n`;
    markdown += `**Date:** ${conversation.modified.toLocaleString()}\n`;
    markdown += `**File:** ${conversation.name}\n\n`;
    markdown += `---\n\n`;
    
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
    
    console.log(colors.success(`\n📤 Conversation exported successfully!`));
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
  
  const selectedConversation = await showLiveSearch();
  if (selectedConversation) {
    await showConversationActions(selectedConversation);
  } else {
    console.log(colors.dim('\nGoodbye! 👋'));
  }
}

main().catch(console.error);