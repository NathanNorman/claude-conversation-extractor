#!/usr/bin/env node

// Test dynamic preview functionality
import { IndexedSearch } from './src/search/indexed-search.js';
import chalk from 'chalk';

async function testDynamicPreview() {
  console.log(chalk.bold.cyan('\nTesting Dynamic Preview Functionality\n'));
  console.log(chalk.dim('=' .repeat(80)));
  
  try {
    const search = new IndexedSearch();
    const query = 'java';
    
    console.log(chalk.yellow(`Searching for: "${query}"\n`));
    
    const results = await search.search(query);
    
    if (results.results.length === 0) {
      console.log(chalk.red('No results found'));
      return;
    }
    
    console.log(chalk.green(`Found ${results.results.length} conversations\n`));
    
    // Show first 3 results with dynamic preview info
    for (let i = 0; i < Math.min(3, results.results.length); i++) {
      const result = results.results[i];
      
      console.log(chalk.cyan(`\nResult ${i + 1}:`));
      console.log(`  Project: ${result.project}`);
      console.log(`  Total occurrences: ${chalk.bold(result.totalOccurrences || 0)}`);
      console.log(`  Number of previews: ${chalk.bold(result.allPreviews?.length || 0)}`);
      
      if (result.allPreviews && result.allPreviews.length > 0) {
        console.log(chalk.green('\n  ✓ Dynamic previews generated!'));
        
        // Show all preview snippets
        result.allPreviews.forEach((preview, idx) => {
          console.log(chalk.dim(`\n  Preview ${idx + 1}/${result.allPreviews.length}:`));
          
          // Render with highlights
          const highlighted = preview.replace(
            /\[HIGHLIGHT\](.*?)\[\/HIGHLIGHT\]/g,
            (match, p1) => chalk.bold.yellow(p1)
          );
          
          // Truncate for display
          const truncated = highlighted.length > 200 
            ? highlighted.substring(0, 200) + '...' 
            : highlighted;
          
          console.log('    ' + truncated.replace(/\n/g, '\n    '));
        });
      } else {
        console.log(chalk.yellow('\n  ⚠ No dynamic previews (using static preview)'));
        console.log(`  Static preview: ${result.preview?.substring(0, 100)}...`);
      }
      
      console.log(chalk.dim('\n' + '-'.repeat(80)));
    }
    
    console.log(chalk.green('\n✅ Dynamic preview test complete!'));
    console.log(chalk.dim('\nNote: If previews show the search term highlighted, the feature is working.'));
    console.log(chalk.dim('If not, the search term may not appear in the conversation text.\n'));
    
  } catch (error) {
    if (error.message?.includes('No search index found')) {
      console.log(chalk.red('❌ No search index found.'));
      console.log(chalk.yellow('Please run: npm start → Choose "Quick Setup" first\n'));
    } else {
      console.error(chalk.red('Error:'), error);
    }
  }
}

testDynamicPreview();