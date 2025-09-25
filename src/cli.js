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

// Vibe-log style icons
const icons = {
  search: '🔍',
  file: '📄',
  folder: '📁',
  success: '✓',
  error: '✗',
  arrow: '→'
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
            // Skip inaccessible project directories
          }
        }
      }
    } catch (error) {
      console.log(colors.error('❌ Error accessing Claude conversations directory'));
      console.log(colors.dim(`Path: ${this.conversationsPath}`));
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
            const messageContent = typeof parsed.content === 'string' 
              ? parsed.content 
              : JSON.stringify(parsed.content);
              
            if (messageContent.toLowerCase().includes(queryLower)) {
              matchCount++;
              if (previews.length < 2) {
                // Extract a preview around the match
                const sentences = messageContent.split(/[.!?]+/);
                const matchingSentence = sentences.find(s => s.toLowerCase().includes(queryLower));
                if (matchingSentence) {
                  previews.push(matchingSentence.trim().slice(0, 80));
                }
              }
            }
          } catch {
            // Skip invalid JSON lines
          }
        }
        
        if (matchCount > 0) {
          results.push({
            file: conversation,
            matches: matchCount,
            previews: previews,
            relevance: matchCount / lines.length
          });
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }
    
    return results.sort((a, b) => b.relevance - a.relevance);
  }
}

// Live search interface like vibe-log
async function showLiveSearchInterface() {
  const extractor = new ClaudeConversationExtractor();
  
  console.clear();
  
  // Vibe-log style banner
  console.log(colors.accent(`
 ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗
██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝
██║     ██║     ███████║██║   ██║██║  ██║█████╗  
██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝  
╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗
 ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝
  `));
  
  console.log(colors.primary('        🔍 Interactive Conversation Search\n'));
  
  // Get all conversations
  const conversations = await extractor.findConversations();
  
  if (conversations.length === 0) {
    console.log(colors.error('❌ No Claude conversations found!'));
    console.log(colors.dim('Make sure you have used Claude Code at least once.'));
    return;
  }
  
  console.log(colors.success(`✅ Found ${conversations.length} conversations\n`));
  
  // Live search using inquirer with autocomplete style
  let searchResults = [];
  
  const createSearchChoices = async (input = '') => {
    if (!input || input.length < 2) {
      return [
        { name: colors.dim('Type at least 2 characters to search...'), value: null, disabled: true }
      ];
    }
    
    console.log(colors.info(`\n🔎 Searching for "${input}"...`));
    const results = await extractor.searchConversations(input, conversations);
    
    if (results.length === 0) {
      return [
        { name: colors.warning('❌ No matches found'), value: null, disabled: true },
        { name: colors.dim('Try a different search term'), value: null, disabled: true }
      ];
    }
    
    searchResults = results; // Store for later use
    
    return results.slice(0, 10).map((result, index) => {
      const date = result.file.modified.toLocaleDateString();
      const time = result.file.modified.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      const project = result.file.project.slice(0, 20);
      const relevance = (result.relevance * 100).toFixed(0);
      const preview = result.previews[0] || 'No preview available';
      
      return {
        name: `${colors.dim(date + ' ' + time)} ${colors.accent('│')} ${colors.primary(project)} ${colors.accent('│')} ${colors.success(relevance + '% match')}\n    ${colors.subdued(preview.slice(0, 60) + '...')}`,
        value: result.file,
        short: `${project} (${date})`
      };
    });
  };
  
  // Use inquirer's autocomplete-style prompt
  try {
    // Try to use inquirer-autocomplete-prompt for live search
    const AutocompletePrompt = await import('inquirer-autocomplete-prompt').catch(() => null);
    
    if (AutocompletePrompt?.default) {
      inquirer.registerPrompt('autocomplete', AutocompletePrompt.default);
      
      const { selectedConversation } = await inquirer.prompt([
        {
          type: 'autocomplete',
          name: 'selectedConversation',
          message: colors.primary('🔍 Search conversations (live results):'),
          source: async (answersSoFar, input) => {
            return await createSearchChoices(input);
          },
          pageSize: 8,
          suggestOnly: false
        }
      ]);
      
      if (selectedConversation) {
        await showConversationActions(selectedConversation);
      }
      
    } else {
      // Fallback to manual search
      await showManualSearch(extractor, conversations);
    }
    
  } catch (error) {
    // Fallback to manual search
    await showManualSearch(extractor, conversations);
  }
}

async function showManualSearch(extractor, conversations) {
  // Simple search prompt
  const { searchTerm } = await inquirer.prompt([
    {
      type: 'input',
      name: 'searchTerm',
      message: colors.primary('🔍 Enter search term:'),
      validate: (input) => input.trim().length > 0 || 'Please enter a search term'
    }
  ]);
  
  console.log(colors.info(`\n🔎 Searching for "${searchTerm}"...`));
  
  const results = await extractor.searchConversations(searchTerm, conversations);
  
  if (results.length === 0) {
    console.log(colors.warning('❌ No matches found'));
    
    const { tryAgain } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'tryAgain',
        message: 'Try another search?',
        default: true
      }
    ]);
    
    if (tryAgain) {
      await showLiveSearchInterface();
    }
    return;
  }
  
  // Show results in vibe-log style
  const choices = results.slice(0, 15).map((result) => {
    const date = result.file.modified.toLocaleDateString();
    const time = result.file.modified.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    const project = result.file.project.slice(0, 25);
    const relevance = (result.relevance * 100).toFixed(0);
    const preview = result.previews[0] || 'No preview';
    
    return {
      name: `${colors.dim(date + ' ' + time)} ${colors.accent('│')} ${colors.primary(project)} ${colors.accent('│')} ${colors.success(relevance + '% match')}\n    ${colors.subdued(preview.slice(0, 70) + '...')}`,
      value: result.file,
      short: `${project} (${date})`
    };
  });
  
  // Add search again option
  choices.push(new inquirer.Separator());
  choices.push({
    name: colors.dim('🔄 Search again'),
    value: 'search_again',
    short: 'Search again'
  });
  
  const { selectedConversation } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedConversation',
      message: colors.primary(`Select conversation (${results.length} found):`),
      choices,
      pageSize: 10,
      loop: false
    }
  ]);
  
  if (selectedConversation === 'search_again') {
    await showLiveSearchInterface();
    return;
  }
  
  if (selectedConversation) {
    await showConversationActions(selectedConversation);
  }
}

async function showConversationActions(conversation) {
  console.clear();
  
  // Show conversation preview
  console.log(colors.primary('\n📄 Conversation Preview\n'));
  console.log(colors.dim(`Project: ${conversation.project}`));
  console.log(colors.dim(`File: ${conversation.name}`));
  console.log(colors.dim(`Modified: ${conversation.modified.toLocaleString()}`));
  console.log(colors.dim(`Size: ${(conversation.size / 1024).toFixed(1)} KB`));
  console.log('\n' + colors.dim('─'.repeat(60)) + '\n');
  
  // Show first few messages
  try {
    const content = await readFile(conversation.path, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    let messageCount = 0;
    
    for (const line of lines) {
      if (messageCount >= 5) break; // Show first 5 messages
      
      try {
        const parsed = JSON.parse(line);
        const speaker = parsed.speaker || 'unknown';
        const messageContent = typeof parsed.content === 'string' 
          ? parsed.content 
          : JSON.stringify(parsed.content, null, 2);
        
        if (speaker === 'human') {
          console.log(colors.primary('👤 Human:'));
        } else if (speaker === 'assistant') {
          console.log(colors.success('🤖 Assistant:'));
        }
        
        // Show preview of message
        const preview = messageContent.slice(0, 200);
        console.log(colors.dim('   ' + preview + (messageContent.length > 200 ? '...' : '')));
        console.log('');
        messageCount++;
      } catch {
        // Skip invalid JSON lines
      }
    }
    
    if (lines.length > 5) {
      console.log(colors.subdued(`... and ${lines.length - 5} more messages`));
    }
    
  } catch (error) {
    console.log(colors.error('❌ Error reading conversation file'));
  }
  
  // Action menu - vibe-log style
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: colors.primary('What would you like to do?'),
      choices: [
        { 
          name: `${icons.file} Copy file path`, 
          value: 'copy' 
        },
        { 
          name: `${icons.folder} Show in finder`, 
          value: 'finder' 
        },
        { 
          name: `📝 Create Claude Code context`, 
          value: 'context' 
        },
        new inquirer.Separator(),
        { 
          name: `${colors.dim('🔙 Back to search')}`, 
          value: 'back' 
        },
        { 
          name: `${colors.dim('🔍 New search')}`, 
          value: 'search' 
        },
        { 
          name: `${colors.dim('🚪 Exit')}`, 
          value: 'exit' 
        }
      ],
      pageSize: 10
    }
  ]);
  
  switch (action) {
    case 'copy':
      console.log(colors.success(`\n📋 File path copied to terminal:`));
      console.log(colors.highlight(conversation.path));
      console.log(colors.dim('Select the path above to copy it'));
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
      await showConversationActions(conversation);
      break;
      
    case 'finder':
      console.log(colors.info(`\n📂 File location:`));
      console.log(colors.highlight(`Project: ${conversation.project}`));
      console.log(colors.highlight(`Path: ${conversation.path}`));
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
      await showConversationActions(conversation);
      break;
      
    case 'context':
      // Create a context file for Claude Code
      try {
        const content = await readFile(conversation.path, 'utf-8');
        const contextPath = join(process.cwd(), `claude-context-${conversation.project}.md`);
        await require('fs').promises.writeFile(contextPath, `# Claude Conversation Context\n\n**Project:** ${conversation.project}\n**File:** ${conversation.name}\n**Modified:** ${conversation.modified.toLocaleString()}\n\n---\n\n${content}`);
        console.log(colors.success(`\n🚀 Claude Code context created:`));
        console.log(colors.highlight(contextPath));
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
        await showConversationActions(conversation);
      } catch (error) {
        console.log(colors.error('❌ Error creating context file'));
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
        await showConversationActions(conversation);
      }
      break;
      
    case 'back':
    case 'search':
      await showLiveSearchInterface();
      break;
      
    case 'exit':
      console.log(colors.dim('\nGoodbye! 👋'));
      process.exit(0);
      break;
  }
}

async function main() {
  console.clear();
  await showLiveSearchInterface();
}

// Handle CLI execution and errors
main().catch(error => {
  console.error(colors.error('❌ Error:'), error.message);
  process.exit(1);
});