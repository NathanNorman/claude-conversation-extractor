/**
 * Keyword Visualizer
 *
 * Generate beautiful ASCII visualizations for keyword analytics.
 * Includes bar charts, trend indicators, and word clouds.
 */

import chalk from 'chalk';
import { pad } from './formatters.js';

/**
 * Render a horizontal bar chart for keywords
 * @param {Array<{term: string, count: number, percentage?: number}>} keywords - Keywords with counts
 * @param {number} maxWidth - Maximum bar width (default 40)
 * @returns {string} Multi-line bar chart
 */
export function renderKeywordBarChart(keywords, maxWidth = 40) {
  if (!keywords || keywords.length === 0) {
    return '';
  }

  // Find the maximum count for scaling
  const maxCount = Math.max(...keywords.map(k => k.count));

  if (maxCount === 0) {
    return '';
  }

  // Find longest term for alignment
  const maxTermLength = Math.max(...keywords.map(k => k.term.length));

  // Generate bar chart lines
  const lines = keywords.map((keyword) => {
    // Calculate bar length
    const barLength = Math.round((keyword.count / maxCount) * maxWidth);
    const bar = chalk.blue('█'.repeat(barLength));

    // Format the term (left-aligned)
    const term = pad(keyword.term, maxTermLength + 1);

    // Format the count (right-aligned)
    const count = keyword.count.toString().padStart(5);

    // Optional percentage
    const percentage = keyword.percentage
      ? chalk.dim(` (${keyword.percentage.toFixed(0)}%)`)
      : '';

    return `${term}${bar}${count}${percentage}`;
  }).join('\n');

  return lines;
}

/**
 * Render trend indicators with directional arrows
 * @param {Array<{keyword: string, changePercent: number, direction?: string}>} trends - Trend data
 * @returns {string} Multi-line trend indicators
 */
export function renderTrendIndicators(trends) {
  if (!trends || trends.length === 0) {
    return '';
  }

  // Sort by absolute change percentage (highest first)
  const sorted = [...trends].sort((a, b) => {
    const absA = Math.abs(a.changePercent);
    const absB = Math.abs(b.changePercent);
    return absB - absA;
  });

  // Find longest keyword for alignment
  const maxKeywordLength = Math.max(...sorted.map(t => t.keyword.length));

  // Generate trend lines
  const lines = sorted.map((trend) => {
    // Determine direction and color
    let arrow;
    let valueColor;

    if (trend.direction === 'up' || trend.changePercent > 0) {
      arrow = chalk.green('↗');
      valueColor = chalk.green;
    } else if (trend.direction === 'down' || trend.changePercent < 0) {
      arrow = chalk.red('↘');
      valueColor = chalk.red;
    } else {
      arrow = chalk.gray('→');
      valueColor = chalk.gray;
    }

    // Format keyword
    const keyword = pad(trend.keyword, maxKeywordLength + 1);

    // Format percentage with sign
    const sign = trend.changePercent > 0 ? '+' : '';
    const percentage = valueColor(`${sign}${trend.changePercent.toFixed(0)}%`);

    // Create trend label
    const label = trend.direction ? chalk.dim(`(trending ${trend.direction})`) : '';

    return `${arrow}  ${keyword}${percentage}  ${label}`.trimEnd();
  }).join('\n');

  return lines;
}

/**
 * Render a keyword cloud with size-based styling
 * @param {Array<{term: string, count: number, percentage?: number}>} keywords - Keywords with counts
 * @param {number} maxTerms - Maximum terms to display (default 20)
 * @returns {string} Wrapped text cloud
 */
export function renderKeywordCloud(keywords, maxTerms = 20) {
  if (!keywords || keywords.length === 0) {
    return '';
  }

  // Limit to maxTerms and sort by count descending
  const topKeywords = [...keywords]
    .sort((a, b) => b.count - a.count)
    .slice(0, maxTerms);

  // Divide keywords into tiers for styling
  const tier1Count = Math.ceil(topKeywords.length * 0.1); // Top 10%
  const tier2Count = Math.ceil(topKeywords.length * 0.3); // Top 30%

  // Format each keyword with size-based styling
  const formattedKeywords = topKeywords.map((keyword, index) => {
    const text = keyword.term;

    // Apply styling based on rank/count
    if (index < tier1Count) {
      // Top tier: bold uppercase
      return chalk.bold.blue(text.toUpperCase());
    } else if (index < tier2Count) {
      // Middle tier: normal
      return chalk.blue(text);
    } else {
      // Bottom tier: dim
      return chalk.dim(text);
    }
  });

  // Wrap text to fit terminal width
  const terminalWidth = 80;
  let currentLine = '';
  const lines = [];

  // Helper to remove ANSI codes
  // eslint-disable-next-line no-control-regex
  const stripAnsi = (str) => str.replace(/\x1b\[[0-9;]*m/g, '');

  for (const keyword of formattedKeywords) {
    const keywordLength = stripAnsi(keyword).length; // Remove ANSI codes for length

    if (currentLine.length > 0 && currentLine.length + keywordLength + 1 > terminalWidth) {
      lines.push(currentLine);
      currentLine = '';
    }

    if (currentLine.length > 0) {
      currentLine += ' ';
    }
    currentLine += keyword;
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines.join('\n');
}

/**
 * Create a comparison visualization for two keyword sets
 * @param {Array<{term: string, count: number}>} before - Keywords before
 * @param {Array<{term: string, count: number}>} after - Keywords after
 * @returns {string} Side-by-side comparison
 */
export function renderKeywordComparison(before, after) {
  if (!before || !after || before.length === 0 || after.length === 0) {
    return '';
  }

  const maxItems = Math.max(before.length, after.length);
  const lines = [];

  // Header
  lines.push(chalk.bold('BEFORE') + ' '.repeat(20) + chalk.bold('AFTER'));
  lines.push('-'.repeat(50));

  // Comparison rows
  for (let i = 0; i < maxItems; i++) {
    const beforeItem = before[i];
    const afterItem = after[i];

    let beforeText = '';
    if (beforeItem) {
      beforeText = `${beforeItem.term.padEnd(15)} ${beforeItem.count.toString().padStart(5)}`;
    }

    let afterText = '';
    if (afterItem) {
      afterText = `${afterItem.term.padEnd(15)} ${afterItem.count.toString().padStart(5)}`;
    }

    lines.push(beforeText.padEnd(25) + afterText);
  }

  return lines.join('\n');
}
