#!/usr/bin/env node

import inquirer from 'inquirer';
import chalk from 'chalk';
import { readdir, stat, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

// Simple colors like vibe-log
const colors = {
  primary: chalk.cyan,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  accent: chalk.magenta,
  highlight: chalk.bold.white,
  dim: chalk.gray
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
              const messageContent = parsed.content;
              
              if (messageContent.toLowerCase().includes(queryLower)) {
                matchCount++;
                if (previews.length < 1) {
                  // Find the sentence with the match
                  const sentences = messageContent.split(/[.!?]+/);
                  const matchingSentence = sentences.find(s => s.toLowerCase().includes(queryLower));
                  if (matchingSentence) {
                    previews.push(matchingSentence.trim());
                  }
                }
              }
            }
          } catch {
            // Skip invalid JSON
          }
        }
        
        if (matchCount > 0) {
          const relevance = Math.min(1.0, matchCount / Math.max(lines.length * 0.1, 1));
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

async function main() {
  console.clear();
  
  // Clean banner
  console.log(colors.accent(`
 ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗
██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝
██║     ██║     ███████║██║   ██║██║  ██║█████╗  
██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝  
╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗
 ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝
  `));
  
  console.log(colors.primary('        🔍 Interactive Conversation Search\n'));
  
  const extractor = new ClaudeConversationExtractor();
  const conversations = await extractor.findConversations();
  
  if (conversations.length === 0) {
    console.log(colors.error('❌ No Claude conversations found!'));
    return;
  }
  
  console.log(colors.success(`✅ Found ${conversations.length} conversations\n`));
  
  while (true) {
    // Simple search input
    const { searchTerm } = await inquirer.prompt([
      {
        type: 'input',
        name: 'searchTerm',
        message: colors.primary('🔍 Enter search term (or "exit" to quit):'),
        validate: (input) => {
          if (input.trim().toLowerCase() === 'exit') return true;
          return input.trim().length >= 2 || 'Please enter at least 2 characters';
        }
      }
    ]);
    
    if (searchTerm.toLowerCase() === 'exit') {
      console.log(colors.dim('\nGoodbye! 👋'));
      break;
    }
    
    console.log(colors.info(`\n🔎 Searching for "${searchTerm}"...`));
    
    const results = await extractor.searchConversations(searchTerm, conversations);
    
    if (results.length === 0) {
      console.log(colors.warning('❌ No matches found\n'));
      continue;
    }
    
    // Format results for inquirer list
    const choices = results.slice(0, 10).map((result) => {
      const date = result.file.modified.toLocaleDateString();
      const time = result.file.modified.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      const project = result.file.project.slice(0, 30);
      const relevance = Math.max(1, Math.round(result.relevance * 100));
      const preview = result.preview.slice(0, 60);
      
      return {
        name: `${colors.dim(date + ' ' + time)} ${colors.accent('│')} ${colors.primary(project)} ${colors.accent('│')} ${colors.success(relevance + '%')}\n    ${colors.dim(preview + '...')}`,
        value: result.file,
        short: `${project} (${date})`
      };
    });
    
    // Add search again option
    choices.push(new inquirer.Separator());
    choices.push({
      name: colors.dim('🔍 Search again'),
      value: 'search_again',
      short: 'Search again'
    });
    
    if (results.length > 10) {
      console.log(colors.dim(`Showing top 10 of ${results.length} results\n`));
    }
    
    // Let user select
    const { selectedConversation } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedConversation',
        message: colors.primary(`Select conversation (${results.length} found):`),
        choices,
        pageSize: 8,
        loop: false
      }
    ]);
    
    if (selectedConversation === 'search_again') {
      continue; // Go back to search
    }
    
    if (selectedConversation) {
      console.clear();
      console.log(colors.primary('\n📄 Selected Conversation\n'));
      console.log(colors.dim(`Project: ${selectedConversation.project}`));
      console.log(colors.dim(`File: ${selectedConversation.name}`));
      console.log(colors.dim(`Path: ${selectedConversation.path}`));
      console.log(colors.dim(`Modified: ${selectedConversation.modified.toLocaleString()}`));
      console.log(colors.dim(`Size: ${(selectedConversation.size / 1024).toFixed(1)} KB\n`));
      
      // Action menu
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
          console.log(colors.success(`\n📋 File path:\n${colors.highlight(selectedConversation.path)}`));
          console.log(colors.dim('\n(Select the path above to copy it)'));
          await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
          break;
          
        case 'location':
          console.log(colors.info(`\n📂 File location:\n${colors.highlight(selectedConversation.path)}`));
          await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
          break;
          
        case 'context':
          try {
            const content = await readFile(selectedConversation.path, 'utf-8');
            const contextPath = join(process.cwd(), `claude-context-${selectedConversation.project}.md`);
            await require('fs').promises.writeFile(contextPath, `# Claude Context\n\n**Project:** ${selectedConversation.project}\n**File:** ${selectedConversation.name}\n\n---\n\n${content}`);
            console.log(colors.success(`\n🚀 Context file created:\n${colors.highlight(contextPath)}`));
            await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
          } catch (error) {
            console.log(colors.error('❌ Error creating context file'));
            await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
          }
          break;
          
        case 'exit':
          console.log(colors.dim('\nGoodbye! 👋'));
          process.exit(0);
          
        case 'back':
          continue; // Go back to search
      }
    }
  }
}

main().catch(console.error);