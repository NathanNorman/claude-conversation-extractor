#!/usr/bin/env node

// Direct test of the highlighting - bypasses all menus
import { IndexedSearch } from './src/search/indexed-search.js';
import chalk from 'chalk';

// Test highlighting directly
async function testHighlighting() {
  console.log('Testing search highlighting...\n');
  
  try {
    const search = new IndexedSearch();
    const results = await search.search('java');
    
    if (results.results.length > 0) {
      console.log(`Found ${results.results.length} results for "java"\n`);
      
      // Show first 3 results with their previews
      for (let i = 0; i < Math.min(3, results.results.length); i++) {
        const result = results.results[i];
        console.log(`Result ${i + 1}:`);
        console.log(`  Project: ${result.project}`);
        console.log(`  Relevance: ${Math.round(result.relevance * 100)}%`);
        console.log(`  Matched words: ${JSON.stringify(result.matchedWords) || 'none'}`);
        console.log(`  Preview (first 200 chars):`);
        console.log(`    ${result.preview.substring(0, 200)}...`);
        
        // Check if java appears in the full conversation
        console.log(`  Searching for "java" in preview:`, result.preview.toLowerCase().includes('java'));
        
        // Now show with highlighting applied
        const highlighted = result.preview.replace(
          /\[HIGHLIGHT\](.*?)\[\/HIGHLIGHT\]/g, 
          (match, p1) => chalk.bold.yellow(p1)
        );
        console.log(`  Preview (with highlighting):`);
        console.log(`    ${highlighted}\n`);
        console.log('-'.repeat(80));
      }
    } else {
      console.log('No results found');
    }
  } catch (error) {
    if (error.message?.includes('No search index found')) {
      console.log('❌ No search index found. Please run setup first.');
      console.log('   Run: npm start → Choose "Quick Setup"');
    } else {
      console.error('Error:', error);
    }
  }
}

testHighlighting();