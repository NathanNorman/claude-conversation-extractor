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
        const previews = [];
        
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.content && typeof parsed.content === 'string') {
              if (parsed.content.toLowerCase().includes(queryLower)) {
                matchCount++;
                if (previews.length < 1) {
                  const sentences = parsed.content.split(/[.!?]+/);
                  const match = sentences.find(s => s.toLowerCase().includes(queryLower));
                  if (match) {
                    previews.push(match.trim());
                  }
                }
              }
            }
          } catch {
            // Skip invalid JSON
          }
        }
        
        if (matchCount > 0) {
          results.push({
            file: conversation,
            matches: matchCount,
            preview: previews[0] || 'Match found in conversation',
            relevance: Math.min(1.0, (matchCount * 5) / Math.max(lines.length, 1))
          });
        }
      } catch (error) {
        // Skip unreadable files
      }
    }
    
    return results.sort((a, b) => b.relevance - a.relevance);
  }
}

// Live search with proper rendering
async function showLiveSearch() {
  const extractor = new ClaudeConversationExtractor();
  const conversations = await extractor.findConversations();
  
  if (conversations.length === 0) {
    console.log(colors.error('❌ No Claude conversations found!'));
    return;
  }
  
  let searchTerm = '';
  let results = [];
  let selectedIndex = 0;
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  
  const drawScreen = async () => {
    // Build entire screen as string for atomic update
    let screen = '\u001b[2J\u001b[H'; // Clear and home
    
    // Banner
    screen += colors.accent(`
 ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗
██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝
██║     ██║     ███████║██║   ██║██║  ██║█████╗  
██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝  
╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗
 ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝
`) + '\n';
    
    screen += colors.primary('        🔍 Interactive Conversation Search') + '\n';
    screen += colors.success(`✅ Found ${conversations.length} conversations`) + '\n\n';
    
    // Search input line
    screen += colors.primary('🔍 Search: ') + colors.highlight(searchTerm) + colors.dim('_') + '\n';
    
    // Show search results if we have enough characters
    if (searchTerm.length >= 2) {
      try {
        results = await extractor.searchConversations(searchTerm, conversations);
        
        if (results.length === 0) {
          screen += '\n' + colors.warning('❌ No matches found') + '\n';
        } else {
          screen += '\n' + colors.info(`📋 Found ${results.length} matches:`) + '\n\n';
          
          // Make sure selectedIndex is valid
          if (selectedIndex >= results.length) {
            selectedIndex = 0;
          }
          
          // Display up to 6 results
          const displayResults = results.slice(0, 6);
          displayResults.forEach((result, index) => {
            const isSelected = index === selectedIndex;
            const date = result.file.modified.toLocaleDateString();
            const time = result.file.modified.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const project = result.file.project.slice(0, 30);
            const relevance = Math.max(1, Math.round(result.relevance * 100));
            
            const cursor = isSelected ? colors.accent('▶ ') : '  ';
            screen += `${cursor}${colors.dim(date + ' ' + time)} ${colors.accent('│')} ${colors.primary(project)} ${colors.accent('│')} ${colors.success(relevance + '%')}` + '\n';
            
            if (isSelected && result.preview) {
              screen += colors.subdued(`    ${result.preview.slice(0, 70)}...`) + '\n';
            }
          });
          
          if (results.length > 6) {
            screen += '\n' + colors.dim(`... and ${results.length - 6} more results`) + '\n';
          }
        }
      } catch (error) {
        screen += '\n' + colors.error(`❌ Search error: ${error.message}`) + '\n';
      }
    } else if (searchTerm.length === 1) {
      screen += '\n' + colors.dim('Type at least 2 characters to search...') + '\n';
    } else {
      screen += '\n' + colors.dim('Start typing to search conversations...') + '\n';
    }
    
    screen += '\n' + colors.dim('[↑↓] Navigate  [Enter] Select  [Esc] Exit  [Backspace] Delete') + '\n';
    
    // Write entire screen at once to prevent flicker
    process.stdout.write(screen);
  };
  
  return new Promise((resolve) => {
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
        selectedIndex = Math.max(0, selectedIndex - 1);
        await drawScreen();
      } else if (key && key.name === 'down') {
        selectedIndex = Math.min(Math.max(0, results.length - 1), selectedIndex + 1);
        await drawScreen();
      } else if (key && key.name === 'backspace') {
        searchTerm = searchTerm.slice(0, -1);
        selectedIndex = 0;
        await drawScreen();
      } else if (str && str.length === 1 && str.charCodeAt(0) >= 32) {
        searchTerm += str;
        selectedIndex = 0;
        await drawScreen();
      }
    };
    
    const cleanup = () => {
      process.stdin.removeListener('keypress', handleKeypress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      rl.close();
    };
    
    readline.emitKeypressEvents(process.stdin);
    process.stdin.on('keypress', handleKeypress);
    
    // Initial render
    drawScreen();
  });
}

async function showConversationActions(conversation) {
  console.clear();
  
  console.log(colors.primary('\n📄 Conversation Details\n'));
  console.log(colors.dim(`Project: ${conversation.project}`));
  console.log(colors.dim(`File: ${conversation.name}`));
  console.log(colors.dim(`Path: ${conversation.path}`));
  console.log(colors.dim(`Modified: ${conversation.modified.toLocaleString()}`));
  console.log(colors.dim(`Size: ${(conversation.size / 1024).toFixed(1)} KB\n`));
  
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
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
    case 'copy':
      console.log(colors.success(`\n📋 File path:\n${colors.highlight(conversation.path)}`));
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
      await showConversationActions(conversation);
      break;
      
    case 'location':
      console.log(colors.info(`\n📂 Location:\n${colors.highlight(conversation.path)}`));
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
      await showConversationActions(conversation);
      break;
      
    case 'context':
      try {
        const content = await readFile(conversation.path, 'utf-8');
        const contextPath = join(process.cwd(), `claude-context-${conversation.project}.md`);
        await require('fs').promises.writeFile(contextPath, `# Claude Context\n\n**Project:** ${conversation.project}\n**File:** ${conversation.name}\n\n---\n\n${content}`);
        console.log(colors.success(`\n🚀 Context created:\n${colors.highlight(contextPath)}`));
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
        await showConversationActions(conversation);
      } catch (error) {
        console.log(colors.error('❌ Error creating context file'));
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
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