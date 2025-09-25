#!/usr/bin/env node

import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs-extra';
import { readdir, stat, readFile } from 'fs/promises';
import { join, basename } from 'path';
import { homedir } from 'os';

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
            // Skip inaccessible project directories
          }
        }
      }
    } catch (error) {
      console.log(chalk.red('❌ Error accessing Claude conversations directory'));
      console.log(chalk.gray(`Path: ${this.conversationsPath}`));
    }
    
    return conversations.sort((a, b) => b.modified.getTime() - a.modified.getTime());
  }

  async searchConversations(query, conversations) {
    const results = [];
    const queryLower = query.toLowerCase();
    
    for (const conversation of conversations) {
      try {
        const content = await readFile(conversation.path, 'utf-8');
        const lines = content.split('\\n').filter(line => line.trim());
        const matches = [];
        
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            const messageContent = typeof parsed.content === 'string' 
              ? parsed.content 
              : JSON.stringify(parsed.content);
              
            if (messageContent.toLowerCase().includes(queryLower)) {
              // Extract a preview of the matching content
              const words = messageContent.split(' ');
              const matchIndex = words.findIndex(word => word.toLowerCase().includes(queryLower));
              const start = Math.max(0, matchIndex - 10);
              const end = Math.min(words.length, matchIndex + 10);
              const preview = words.slice(start, end).join(' ');
              matches.push(preview);
            }
          } catch {
            // Skip invalid JSON lines
          }
        }
        
        if (matches.length > 0) {
          results.push({
            file: conversation,
            matches: matches.slice(0, 3), // Max 3 matches per file
            relevance: matches.length / lines.length
          });
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }
    
    return results.sort((a, b) => b.relevance - a.relevance);
  }

  async displayConversation(conversation) {
    console.clear();
    console.log(chalk.blue.bold('\\n📄 Conversation View\\n'));
    console.log(chalk.gray(`Project: ${conversation.project}`));
    console.log(chalk.gray(`File: ${conversation.name}`));
    console.log(chalk.gray(`Modified: ${conversation.modified.toLocaleString()}`));
    console.log(chalk.gray(`Size: ${(conversation.size / 1024).toFixed(1)} KB`));
    console.log('\\n' + '─'.repeat(80) + '\\n');
    
    try {
      const content = await readFile(conversation.path, 'utf-8');
      const lines = content.split('\\n').filter(line => line.trim());
      
      for (const line of lines.slice(0, 20)) { // Show first 20 messages
        try {
          const parsed = JSON.parse(line);
          const speaker = parsed.speaker || 'unknown';
          const messageContent = typeof parsed.content === 'string' 
            ? parsed.content 
            : JSON.stringify(parsed.content, null, 2);
          
          if (speaker === 'human') {
            console.log(chalk.cyan.bold('👤 Human:'));
          } else if (speaker === 'assistant') {
            console.log(chalk.green.bold('🤖 Assistant:'));
          } else {
            console.log(chalk.gray.bold(`${speaker}:`));
          }
          
          // Simple word wrap
          const words = messageContent.split(' ');
          let currentLine = '';
          for (const word of words) {
            if ((currentLine + word).length > 80) {
              console.log('   ' + currentLine);
              currentLine = word + ' ';
            } else {
              currentLine += word + ' ';
            }
          }
          if (currentLine) {
            console.log('   ' + currentLine);
          }
          console.log('');
        } catch {
          // Skip invalid JSON lines
        }
      }
      
      if (lines.length > 20) {
        console.log(chalk.gray(`... and ${lines.length - 20} more messages`));
      }
      
    } catch (error) {
      console.log(chalk.red('❌ Error reading conversation file'));
    }
  }
}

async function showSearchInterface() {
  const extractor = new ClaudeConversationExtractor();
  
  console.log(chalk.blue.bold('\\n🔍 Interactive Search\\n'));
  
  // Get all conversations
  const conversations = await extractor.findConversations();
  
  if (conversations.length === 0) {
    console.log(chalk.red('❌ No Claude conversations found!'));
    console.log(chalk.gray('Make sure you have used Claude Code at least once.'));
    return;
  }
  
  console.log(chalk.green(`✅ Found ${conversations.length} conversations\\n`));
  
  // Simple search prompt like vibe-log
  const { searchTerm } = await inquirer.prompt([
    {
      type: 'input',
      name: 'searchTerm',
      message: chalk.cyan('🔎 Search conversations:'),
      validate: (input) => input.trim().length > 0 || 'Please enter a search term'
    }
  ]);
  
  console.log(chalk.blue(`\\n🔎 Searching for "${searchTerm}"...`));
  
  const results = await extractor.searchConversations(searchTerm, conversations);
  
  if (results.length === 0) {
    console.log(chalk.yellow('❌ No matches found'));
    
    const { tryAgain } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'tryAgain',
        message: 'Try another search?',
        default: true
      }
    ]);
    
    if (tryAgain) {
      await showSearchInterface();
    }
    return;
  }
  
  // Format results for selection menu - vibe-log style
  const choices = results.slice(0, 15).map((result) => {
    const date = result.file.modified.toLocaleDateString();
    const time = result.file.modified.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    const project = result.file.project.slice(0, 25);
    const relevance = (result.relevance * 100).toFixed(0);
    const preview = result.matches[0]?.slice(0, 50) || '';
    
    return {
      name: `${chalk.cyan(date + ' ' + time)} ${chalk.magenta('│')} ${chalk.blue(project)} ${chalk.magenta('│')} ${chalk.green(relevance + '%')} ${chalk.magenta('│')} ${chalk.gray(preview + '...')}`,
      value: result.file,
      short: `${project} (${date})`
    };
  });
  
  // Add option to search again
  choices.push(new inquirer.Separator());
  choices.push({
    name: chalk.dim('🔄 Search again'),
    value: 'search_again',
    short: 'Search again'
  });
  
  if (results.length > 15) {
    choices.unshift({
      name: chalk.gray(`📋 Showing top 15 of ${results.length} results`),
      value: null,
      short: 'Info'
    });
    choices.unshift(new inquirer.Separator());
  }
  
  // Let user select a conversation
  const { selectedConversation } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedConversation',
      message: chalk.cyan(`Select conversation (${results.length} found):`),
      choices,
      pageSize: 12,
      loop: false
    }
  ]);
  
  if (selectedConversation === 'search_again') {
    await showSearchInterface();
    return;
  }
  
  if (selectedConversation) {
    await extractor.displayConversation(selectedConversation);
    
    // Ask what to do with it - vibe-log style
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '📋 Copy file path', value: 'copy' },
          { name: '📝 Open in editor', value: 'edit' },
          { name: '📄 Show file location', value: 'location' },
          new inquirer.Separator(),
          { name: '🔙 Back to search results', value: 'back' },
          { name: '🔍 New search', value: 'search' },
          { name: '🚪 Exit', value: 'exit' }
        ]
      }
    ]);
    
    switch (action) {
      case 'copy':
        console.log(chalk.green(`\\n📋 File path: ${selectedConversation.path}`));
        console.log(chalk.gray('(You can copy this path from the terminal)'));
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
        break;
      case 'edit':
        console.log(chalk.blue(`📝 File location: ${selectedConversation.path}`));
        console.log(chalk.gray('Open this file in your preferred editor'));
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
        break;
      case 'location':
        console.log(chalk.blue(`📂 Project: ${selectedConversation.project}`));
        console.log(chalk.blue(`📄 File: ${selectedConversation.name}`));
        console.log(chalk.blue(`📍 Full path: ${selectedConversation.path}`));
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
        break;
      case 'back':
        // Re-show the search results (would need to implement this)
        await showSearchInterface();
        return;
      case 'search':
        await showSearchInterface();
        return;
      case 'exit':
        break;
    }
  }
}

async function main() {
  console.clear();
  
  // ASCII banner like vibe-log
  console.log(chalk.magenta.bold(`
 ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗
██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝
██║     ██║     ███████║██║   ██║██║  ██║█████╗  
██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝  
╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗
 ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝
                                                  
        🔍 Interactive Conversation Search        
  `));

  await showSearchInterface();
  
  console.log(chalk.gray('\\nGoodbye! 👋'));
}

// Handle CLI execution
main().catch(console.error);