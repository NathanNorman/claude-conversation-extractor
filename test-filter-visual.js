#!/usr/bin/env node

// Visual demonstration of filter indicators
import chalk from 'chalk';

console.log(chalk.bold.cyan('\n📸 Filter Visual Indicator Demo\n'));
console.log('=' .repeat(80));

console.log('\n' + chalk.bold('1. NO FILTERS ACTIVE:'));
console.log('─'.repeat(40));
console.log(chalk.cyan('        🔍 Interactive Conversation Search'));
console.log(chalk.green('✅ Found 151 conversations\n'));
console.log(chalk.dim('  No filters active - showing all repos [Press f to filter]\n'));
console.log(chalk.cyan('🔍 Type to search: ') + chalk.bold.yellow('java') + chalk.gray('│'));
console.log(chalk.blue('\n📋 20 matches found:\n'));

console.log('\n' + chalk.bold('2. WITH FILTER ACTIVE (1 repo):'));
console.log('─'.repeat(40));
console.log(chalk.cyan('        🔍 Interactive Conversation Search'));
console.log(chalk.green('✅ Found 151 conversations\n'));
console.log(chalk.bgMagenta.white.bold(' FILTER ACTIVE ') + ' ' + chalk.magenta('Showing only 1 repo:'));
console.log(chalk.bold.yellow('  📁 claude-conversation-extractor'));
console.log(chalk.gray('  Press [f] to modify or clear filters\n'));
console.log(chalk.cyan('🔍 Type to search: ') + chalk.bold.yellow('java') + chalk.gray('│'));
console.log(chalk.blue('\n📋 3 matches found') + chalk.gray(' (filtered)') + chalk.blue(':\n'));

console.log('\n' + chalk.bold('3. WITH MULTIPLE FILTERS (5 repos):'));
console.log('─'.repeat(40));
console.log(chalk.cyan('        🔍 Interactive Conversation Search'));
console.log(chalk.green('✅ Found 151 conversations\n'));
console.log(chalk.bgMagenta.white.bold(' FILTER ACTIVE ') + ' ' + chalk.magenta('Showing only 5 repos:'));
console.log(chalk.bold.yellow('  📁 toast-analytics, vibe-log-cli, mcp-funnel, +2 more'));
console.log(chalk.gray('  Press [f] to modify or clear filters\n'));
console.log(chalk.cyan('🔍 Type to search: ') + chalk.bold.yellow('java') + chalk.gray('│'));
console.log(chalk.blue('\n📋 12 matches found') + chalk.gray(' (filtered)') + chalk.blue(':\n'));

console.log('\n' + chalk.bold('4. NO RESULTS WITH FILTER:'));
console.log('─'.repeat(40));
console.log(chalk.cyan('        🔍 Interactive Conversation Search'));
console.log(chalk.green('✅ Found 151 conversations\n'));
console.log(chalk.bgMagenta.white.bold(' FILTER ACTIVE ') + ' ' + chalk.magenta('Showing only 1 repo:'));
console.log(chalk.bold.yellow('  📁 some-specific-repo'));
console.log(chalk.gray('  Press [f] to modify or clear filters\n'));
console.log(chalk.cyan('🔍 Type to search: ') + chalk.bold.yellow('python') + chalk.gray('│'));
console.log(chalk.yellow('\n❌ No matches found'));
console.log(chalk.gray('  (Try clearing filters with [f] if too restrictive)'));

console.log('\n' + '=' .repeat(80));
console.log(chalk.green.bold('\n✅ Visual Indicators Added:'));
console.log(chalk.green('• Prominent "FILTER ACTIVE" badge with magenta background'));
console.log(chalk.green('• Shows number of repos being filtered'));
console.log(chalk.green('• Lists first 3 repos, then "+X more" if many selected'));
console.log(chalk.green('• "(filtered)" tag added to result count'));
console.log(chalk.green('• Helpful hint when no results due to filtering'));
console.log(chalk.green('• Clear indication when no filters active\n'));