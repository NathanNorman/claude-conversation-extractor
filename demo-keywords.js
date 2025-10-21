import {
  renderKeywordBarChart,
  renderTrendIndicators,
  renderKeywordCloud,
  renderKeywordComparison
} from './src/analytics/visualizers/keyword-visualizer.js';

import chalk from 'chalk';

console.log(chalk.bold.cyan('\n╔════════════════════════════════════════════════════════════════╗'));
console.log(chalk.bold.cyan('║   KEYWORD ANALYTICS VISUALIZATIONS - COMPLETE DEMONSTRATION   ║'));
console.log(chalk.bold.cyan('╚════════════════════════════════════════════════════════════════╝\n'));

// Real-world example data
const topKeywords = [
  { term: 'typescript', count: 342, percentage: 22 },
  { term: 'debugging', count: 298, percentage: 19 },
  { term: 'api', count: 267, percentage: 17 },
  { term: 'react', count: 245, percentage: 16 },
  { term: 'performance', count: 198, percentage: 13 },
  { term: 'testing', count: 156, percentage: 10 }
];

const trends = [
  { keyword: 'webrtc', changePercent: 67, direction: 'up' },
  { keyword: 'typescript', changePercent: 34, direction: 'up' },
  { keyword: 'ai-integration', changePercent: 52, direction: 'up' },
  { keyword: 'python', changePercent: -22, direction: 'down' },
  { keyword: 'legacy', changePercent: -45, direction: 'down' },
  { keyword: 'docker', changePercent: 5, direction: 'stable' }
];

const allKeywords = [
  { term: 'typescript', count: 342 },
  { term: 'debugging', count: 298 },
  { term: 'api', count: 267 },
  { term: 'react', count: 245 },
  { term: 'performance', count: 198 },
  { term: 'testing', count: 156 },
  { term: 'nodejs', count: 142 },
  { term: 'database', count: 138 },
  { term: 'authentication', count: 125 },
  { term: 'deployment', count: 112 },
  { term: 'mongodb', count: 98 },
  { term: 'caching', count: 87 },
  { term: 'security', count: 76 },
  { term: 'optimization', count: 65 },
  { term: 'uxperience', count: 54 }
];

console.log(chalk.bold.yellow('1️⃣  TOP KEYWORDS BY FREQUENCY'));
console.log(chalk.gray('─'.repeat(70)));
console.log(renderKeywordBarChart(topKeywords));
console.log();

console.log(chalk.bold.yellow('2️⃣  TRENDING KEYWORDS (Last 7 Days)'));
console.log(chalk.gray('─'.repeat(70)));
console.log(renderTrendIndicators(trends));
console.log();

console.log(chalk.bold.yellow('3️⃣  KEYWORD CLOUD (Top 15)'));
console.log(chalk.gray('─'.repeat(70)));
console.log(renderKeywordCloud(allKeywords, 15));
console.log();

console.log(chalk.bold.green('✨ VISUALIZATION COMPLETE ✨'));
console.log(chalk.gray('All functions rendered successfully with proper formatting and colors.\n'));
