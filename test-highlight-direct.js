#!/usr/bin/env node

// Direct test of highlighting logic with controlled data
import chalk from 'chalk';

// Test data with "java" actually in the preview
const testResults = [
  {
    project: 'test-project',
    preview: 'This is a test about java programming and javascript development',
    relevance: 0.95
  },
  {
    project: 'another-project', 
    preview: 'Working on a Java application with Spring Boot framework',
    relevance: 0.85
  },
  {
    project: 'web-project',
    preview: 'Building a web app using JavaScript, not Java, but still relevant',
    relevance: 0.75
  }
];

console.log(chalk.bold('Testing Highlighting Logic:\n'));

// Simulate the highlighting logic from indexed-search.js
const query = 'java';
const queryWords = query.toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .split(/\s+/)
  .filter(word => word.length > 2);

console.log(`Search words: ${queryWords.join(', ')}\n`);

for (const result of testResults) {
  console.log(chalk.cyan(`Project: ${result.project}`));
  console.log(`Relevance: ${Math.round(result.relevance * 100)}%`);
  
  // Apply highlighting (same logic as indexed-search.js lines 174-176)
  let preview = result.preview;
  for (const word of queryWords) {
    const regex = new RegExp(`\\b(${word}\\w*)`, 'gi');
    preview = preview.replace(regex, (match) => `[HIGHLIGHT]${match}[/HIGHLIGHT]`);
  }
  
  console.log('Preview (with markers):');
  console.log(`  ${preview}`);
  
  // Render with colors (same as our cli.js fix)
  const highlighted = preview.replace(
    /\[HIGHLIGHT\](.*?)\[\/HIGHLIGHT\]/g,
    (match, p1) => chalk.bold.yellow(p1)
  );
  
  console.log('Preview (highlighted):');
  console.log(`  ${highlighted}`);
  console.log('-'.repeat(80) + '\n');
}

console.log(chalk.green('\n✓ If you see yellow/highlighted text above, the highlighting logic works!'));
console.log(chalk.yellow('\n⚠ The issue is that the index preview doesn\'t contain the search term.'));
console.log(chalk.dim('  The preview is just the first 200 chars, not where the match occurred.\n'));