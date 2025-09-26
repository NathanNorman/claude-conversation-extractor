#!/usr/bin/env node

// Direct access to search interface, bypassing setup menu
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import { IndexedSearch } from './src/search/indexed-search.js';
import { showLiveSearch } from './src/cli.js';

async function runDirectSearch() {
  console.log(chalk.cyan('\nDirect Search Test - Bypassing Setup\n'));
  
  let searchInterface = null;
  
  try {
    searchInterface = new IndexedSearch();
    console.log(chalk.green('✓ Using indexed search (fast mode)\n'));
  } catch (e) {
    console.log(chalk.yellow('✗ No index found, using basic search\n'));
  }
  
  // Run the actual search interface
  const result = await showLiveSearch(searchInterface);
  
  if (result) {
    console.log(chalk.green('\n✓ Selected a conversation'));
  } else {
    console.log(chalk.dim('\n✗ No conversation selected'));
  }
}

runDirectSearch().catch(console.error);