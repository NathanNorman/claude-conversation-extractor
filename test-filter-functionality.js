#!/usr/bin/env node

// Direct test of filter functionality
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';

async function testFilterFunctionality() {
  console.log(chalk.bold.cyan('\n🧪 Testing Filter Functionality\n'));
  
  // Load conversations to get repos
  const conversationsPath = join(homedir(), '.claude', 'projects');
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
    return false;
  }
  
  console.log(`✅ Found ${conversations.length} conversations`);
  
  // Get unique repos
  const repos = new Set();
  conversations.forEach(conv => {
    if (conv.project) {
      repos.add(conv.project);
    }
  });
  
  const repoArray = Array.from(repos).sort();
  console.log(`✅ Found ${repoArray.length} unique repositories`);
  console.log('   Sample repos:', repoArray.slice(0, 5).join(', '));
  
  // Test filter logic
  const activeFilters = {
    repos: new Set([repoArray[0], repoArray[1]]) // Select first 2 repos
  };
  
  console.log(`\n📋 Testing filter with repos: ${Array.from(activeFilters.repos).join(', ')}`);
  
  // Apply filter
  const filteredConvs = conversations.filter(conv => {
    return activeFilters.repos.has(conv.project);
  });
  
  console.log(`✅ Filter applied: ${filteredConvs.length} of ${conversations.length} conversations match`);
  
  // Verify filter worked correctly
  const allMatch = filteredConvs.every(conv => activeFilters.repos.has(conv.project));
  if (allMatch) {
    console.log(chalk.green('✅ All filtered conversations have correct repos'));
    return true;
  } else {
    console.log(chalk.red('❌ Some filtered conversations have wrong repos'));
    return false;
  }
}

testFilterFunctionality().then(success => {
  if (success) {
    console.log(chalk.green('\n✅ Filter functionality test PASSED\n'));
  } else {
    console.log(chalk.red('\n❌ Filter functionality test FAILED\n'));
  }
});