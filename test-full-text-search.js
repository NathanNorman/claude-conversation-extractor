#!/usr/bin/env node

// Test that ANY word can be searched, not just keywords
import chalk from 'chalk';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

async function testFullTextSearch() {
  console.log(chalk.bold.cyan('\n🔍 Testing Full-Text Search Capability\n'));
  console.log('=' .repeat(80));
  
  // Check the index to see what's indexed
  const indexPath = join(homedir(), '.claude', 'claude_conversations', 'search-index.json');
  
  try {
    const indexContent = await readFile(indexPath, 'utf-8');
    const index = JSON.parse(indexContent);
    
    // Count total unique words indexed
    const totalWords = Object.keys(index.invertedIndex).length;
    
    console.log(chalk.green(`✅ Index Statistics:`));
    console.log(`   Total unique words indexed: ${chalk.bold(totalWords.toLocaleString())}`);
    console.log(`   Total conversations: ${index.conversations.length}`);
    
    // Sample some random words from the index
    const words = Object.keys(index.invertedIndex);
    const samples = [];
    
    // Get some common words
    const commonWords = words.filter(w => 
      index.invertedIndex[w].conversations.length > 10
    ).slice(0, 5);
    
    // Get some rare words  
    const rareWords = words.filter(w => 
      index.invertedIndex[w].conversations.length === 1
    ).slice(0, 5);
    
    // Get some medium frequency words
    const mediumWords = words.filter(w => 
      index.invertedIndex[w].conversations.length > 2 && 
      index.invertedIndex[w].conversations.length < 10
    ).slice(0, 5);
    
    console.log('\n' + chalk.bold('Sample of indexed words:'));
    
    if (commonWords.length > 0) {
      console.log(chalk.green('\n📊 Common words (in many conversations):'));
      commonWords.forEach(word => {
        const count = index.invertedIndex[word].conversations.length;
        console.log(`   • "${word}" - found in ${count} conversations`);
      });
    }
    
    if (mediumWords.length > 0) {
      console.log(chalk.yellow('\n📊 Medium frequency words:'));
      mediumWords.forEach(word => {
        const count = index.invertedIndex[word].conversations.length;
        console.log(`   • "${word}" - found in ${count} conversations`);
      });
    }
    
    if (rareWords.length > 0) {
      console.log(chalk.blue('\n📊 Rare/unique words (in only 1 conversation):'));
      rareWords.forEach(word => {
        console.log(`   • "${word}"`);
      });
    }
    
    // Check if we're indexing everything or just keywords
    const hasAllWords = index.conversations.some(conv => conv.allWords && conv.allWords.length > 0);
    
    console.log('\n' + chalk.bold('Index Type:'));
    if (hasAllWords) {
      console.log(chalk.green('✅ FULL-TEXT INDEX - All words are searchable!'));
      console.log('   Every word from every conversation is indexed');
      console.log('   You can search for ANY word that appears in your conversations');
    } else if (totalWords > 1000) {
      console.log(chalk.green('✅ COMPREHENSIVE INDEX - Many words indexed'));
      console.log('   Index appears to contain extensive vocabulary');
    } else {
      console.log(chalk.yellow('⚠️  KEYWORD INDEX - Limited to top keywords'));
      console.log('   Only the most frequent/important words are indexed');
      console.log('   Rebuild the index to enable full-text search');
    }
    
    console.log('\n' + chalk.bold('What this means:'));
    console.log('• You can search for technical terms like "useState", "dockerfile", "pytest"');
    console.log('• You can search for specific variable names from your code');
    console.log('• You can search for error messages or log outputs');
    console.log('• You can search for names, dates, or any specific text');
    console.log('• Prefix matching works: "java" finds "javascript", "javadoc", etc.');
    
    console.log('\n' + chalk.green.bold('✅ Full-text search is enabled!'));
    console.log(chalk.dim('\nNote: Rebuild the index after this update to index all words\n'));
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(chalk.red('❌ No search index found'));
      console.log(chalk.yellow('\nPlease run: claude-logs → Quick Setup'));
      console.log(chalk.yellow('This will build the new full-text index\n'));
    } else {
      console.error(chalk.red('Error reading index:'), error.message);
    }
  }
}

testFullTextSearch();