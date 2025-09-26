#!/usr/bin/env node

// Test the new filter functionality
import chalk from 'chalk';
import { showLiveSearch } from './src/cli.js';
import { IndexedSearch } from './src/search/indexed-search.js';

console.log(chalk.bold.cyan('\n🔧 Testing Filter Functionality\n'));
console.log(chalk.dim('=' .repeat(80)));

console.log(chalk.yellow('\nInstructions:'));
console.log('1. Press "f" to open the filter menu');
console.log('2. Select "Filter by Repository" to see all available repos');
console.log('3. Use space to select/deselect repos, Enter to confirm');
console.log('4. Search for something to see filtered results');
console.log('5. Press "f" again and "Clear All Filters" to remove filters\n');

console.log(chalk.dim('Press Enter to start...\n'));

process.stdin.once('data', async () => {
  // Try to use indexed search if available
  let searchInterface = null;
  try {
    searchInterface = new IndexedSearch();
    console.log(chalk.green('✓ Using indexed search\n'));
  } catch (e) {
    console.log(chalk.yellow('✗ Using basic search (no index)\n'));
  }
  
  // Launch the search interface with filters
  const result = await showLiveSearch(searchInterface);
  
  if (result) {
    console.log(chalk.green('\n✅ Selected conversation:'), result.project);
  } else {
    console.log(chalk.dim('\n✗ No conversation selected'));
  }
  
  process.exit(0);
});

// Enable raw input only if TTY
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}
process.stdin.resume();