#!/usr/bin/env node

import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { IndexedSearch } from './src/search/indexed-search.js';
import chalk from 'chalk';

// Colors like in vibe-log
const colors = {
  header: chalk.bold.bgHex('#FF4A9D').white,
  primary: chalk.cyan,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  accent: chalk.magenta,
  highlight: chalk.bold.yellow,
  subdued: chalk.gray,
  info: chalk.blue,
  dim: chalk.gray
};

// Simplified version of showLiveSearch for testing
async function testSearch() {
  const conversationsPath = join(homedir(), '.claude', 'projects');
  const exportPath = join(homedir(), '.claude', 'claude_conversations');
  
  // Try to load indexed search
  let searchInterface = null;
  try {
    searchInterface = new IndexedSearch();
    console.log(colors.success('✓ Using indexed search'));
  } catch (e) {
    console.log(colors.warning('✗ No index found, using basic search'));
  }
  
  // Load conversations (simplified version)
  const conversations = [];
  try {
    const projects = await readdir(conversationsPath);
    for (const project of projects) {
      const projectPath = join(conversationsPath, project);
      const projectStat = await stat(projectPath);
      if (projectStat.isDirectory()) {
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
      }
    }
  } catch (error) {
    console.error('Error loading conversations:', error);
  }
  console.log(colors.info(`Found ${conversations.length} conversations\n`));
  
  // Launch search interface (simplified for testing)
  console.log(colors.header(' Interactive Conversation Search '));
  console.log(colors.dim('\nType "java" to test search highlighting...'));
  console.log(colors.dim('Press Ctrl+C to exit\n'));
  
  // Wait a moment then simulate search
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Perform a test search for "java"
  if (searchInterface) {
    const results = await searchInterface.search('java');
    console.log(colors.info(`\nFound ${results.results.length} matches for "java"\n`));
    
    // Show first result with preview
    if (results.results.length > 0) {
      const first = results.results[0];
      console.log(colors.primary('First result:'));
      console.log(colors.dim(`  Project: ${first.project}`));
      console.log(colors.dim(`  Modified: ${new Date(first.modified).toLocaleString()}`));
      console.log(colors.dim(`  Relevance: ${Math.round(first.relevance * 100)}%`));
      console.log(colors.subdued('\n  Context preview:'));
      
      // Show the preview with highlights
      const preview = first.preview;
      const rendered = preview.replace(/\[HIGHLIGHT\](.*?)\[\/HIGHLIGHT\]/g, (match, p1) => {
        return colors.highlight(p1);
      });
      console.log('  ' + rendered);
    }
  }
}

testSearch().catch(console.error);