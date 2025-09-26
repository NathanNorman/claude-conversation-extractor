import chalk from 'chalk';
import boxen from 'boxen';
import inquirer from 'inquirer';
import ora from 'ora';
import { join } from 'path';
import { homedir } from 'os';

// Color scheme matching the main CLI
const colors = {
  primary: chalk.cyan,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  info: chalk.cyan,
  muted: chalk.hex('#808080'),
  accent: chalk.magenta,
  highlight: chalk.bold.white,
  dim: chalk.hex('#606060'),
  subdued: chalk.hex('#909090')
};

export async function showSetupMenu(status) {
  console.clear();
  
  // Build status display
  const statusLines = [];
  
  // Header
  statusLines.push(colors.highlight('CLAUDE CONVERSATION EXTRACTOR - SETUP STATUS'));
  statusLines.push('');
  
  // Current Status
  statusLines.push(colors.info('📊 Current Status:'));
  
  // Extract status
  const extractIcon = status.extractedAll ? '✅' : '❌';
  const extractStatus = status.extractedAll 
    ? colors.success(`${extractIcon} Extract All: Done (${status.extractedCount}/${status.conversationCount} files)`)
    : colors.warning(`${extractIcon} Extract All: Not done (${status.extractedCount}/${status.conversationCount} files)`);
  statusLines.push(`  ${extractStatus}`);
  
  // Index status
  const indexIcon = status.indexBuilt ? '✅' : '❌';
  const indexStatus = status.indexBuilt
    ? colors.success(`${indexIcon} Search Index: Built${status.indexOutdated ? ' (outdated)' : ''}`)
    : colors.warning(`${indexIcon} Search Index: Not built`);
  statusLines.push(`  🗂️  ${indexStatus}`);
  
  // Export location
  const exportPath = status.exportLocation.length > 40 
    ? '...' + status.exportLocation.slice(-37)
    : status.exportLocation;
  statusLines.push(`  📁 Export Location: ${colors.dim(exportPath)}`);
  
  // Search speed estimate
  const searchSpeed = status.indexBuilt ? '~20ms' : '~500ms';
  const speedImprovement = status.indexBuilt ? '' : ' (will be ~20ms)';
  statusLines.push(`  ⚡ Search Speed: ${colors.accent(searchSpeed)}${colors.dim(speedImprovement)}`);
  
  statusLines.push('');
  
  // Display status box
  console.log(boxen(statusLines.join('\n'), {
    padding: 1,
    margin: 1,
    borderStyle: 'round',
    borderColor: 'cyan'
  }));
  
  // Build menu choices
  const choices = [];
  
  // Quick setup option (if needed)
  if (status.needsExtraction || status.needsIndexing) {
    const timeEstimate = status.needsExtraction && status.needsIndexing ? '~3 min' : '~1 min';
    choices.push({
      name: `🚀 ${colors.success('Quick Setup')} (Extract + Index) ${colors.dim(timeEstimate)}`,
      value: 'quick_setup',
      short: 'Quick Setup'
    });
  }
  
  // Individual options
  if (status.needsExtraction) {
    choices.push({
      name: `📤 Extract All Conversations Only ${colors.dim('(~2 min)')}`,
      value: 'extract_only',
      short: 'Extract Only'
    });
  }
  
  if (status.needsIndexing) {
    const indexAction = status.indexOutdated ? 'Rebuild' : 'Build';
    choices.push({
      name: `🗂️  ${indexAction} Search Index Only ${colors.dim('(~30 sec)')}`,
      value: 'index_only',
      short: 'Index Only'
    });
  }
  
  // Advanced options
  choices.push(
    new inquirer.Separator(colors.dim('─────── Advanced Options ───────')),
    {
      name: `📁 Change Export Location ${colors.dim(`(current: ${exportPath})`)}`,
      value: 'change_location',
      short: 'Change Location'
    }
  );
  
  // Analytics option (if we have data)
  if (status.extractedCount > 0) {
    choices.push({
      name: '📊 View Conversation Analytics',
      value: 'view_analytics',
      short: 'Analytics'
    });
  }
  
  // Skip setup option (always available)
  choices.push({
    name: `⏭️  Skip Setup ${colors.dim('(use basic search mode)')}`,
    value: 'skip_setup',
    short: 'Skip'
  });
  
  // Exit option
  choices.push({
    name: colors.error('❌ Exit'),
    value: 'exit',
    short: 'Exit'
  });
  
  // Show menu
  const { choice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'choice',
      message: colors.primary('What would you like to do?'),
      choices,
      pageSize: 10
    }
  ]);
  
  return choice;
}

export async function showAnalytics(status) {
  const analyticsLines = [];
  
  analyticsLines.push(colors.highlight('📊 CONVERSATION ANALYTICS'));
  analyticsLines.push('');
  
  // Basic stats
  analyticsLines.push(colors.info('📈 Overview:'));
  analyticsLines.push(`  Total Conversations: ${colors.accent(status.conversationCount)}`);
  analyticsLines.push(`  Extracted: ${colors.accent(status.extractedCount)}`);
  
  if (status.lastExtractDate) {
    const extractDate = new Date(status.lastExtractDate);
    analyticsLines.push(`  Last Extract: ${colors.dim(extractDate.toLocaleDateString())}`);
  }
  
  if (status.indexLastBuilt) {
    const indexDate = new Date(status.indexLastBuilt);
    analyticsLines.push(`  Index Built: ${colors.dim(indexDate.toLocaleDateString())}`);
  }
  
  analyticsLines.push('');
  
  // Project distribution
  const projectCounts = {};
  for (const conv of status.conversations) {
    projectCounts[conv.project] = (projectCounts[conv.project] || 0) + 1;
  }
  
  const sortedProjects = Object.entries(projectCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  if (sortedProjects.length > 0) {
    analyticsLines.push(colors.info('🏷️  Top Projects:'));
    for (const [project, count] of sortedProjects) {
      const projectName = project.length > 30 ? project.slice(0, 27) + '...' : project;
      const bar = '█'.repeat(Math.round((count / status.conversationCount) * 20));
      analyticsLines.push(`  ${projectName}: ${bar} ${colors.dim(`(${count})`)} `);
    }
  }
  
  analyticsLines.push('');
  
  // Performance stats
  if (status.config.performanceStats.avgSearchTime) {
    analyticsLines.push(colors.info('⚡ Performance:'));
    analyticsLines.push(`  Avg Search Time: ${colors.accent(status.config.performanceStats.avgSearchTime.toFixed(1) + 'ms')}`);
    analyticsLines.push(`  Total Searches: ${colors.accent(status.config.performanceStats.totalSearches)}`);
  }
  
  console.log(boxen(analyticsLines.join('\n'), {
    padding: 1,
    margin: 1,
    borderStyle: 'round',
    borderColor: 'magenta'
  }));
  
  await inquirer.prompt([
    {
      type: 'input',
      name: 'continue',
      message: colors.dim('Press Enter to continue...')
    }
  ]);
}

export async function confirmExportLocation() {
  const { location } = await inquirer.prompt([
    {
      type: 'input',
      name: 'location',
      message: colors.primary('Enter new export location:'),
      default: join(homedir(), '.claude', 'claude_conversations'),
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'Please enter a valid path';
        }
        return true;
      }
    }
  ]);
  
  return location.trim();
}

export function createProgressIndicator() {
  let spinner = null;
  
  return {
    start(message) {
      spinner = ora({
        text: message,
        color: 'cyan',
        spinner: 'dots'
      }).start();
    },
    
    update(message) {
      if (spinner) {
        spinner.text = message;
      }
    },
    
    succeed(message) {
      if (spinner) {
        spinner.succeed(colors.success(message));
      }
    },
    
    fail(message) {
      if (spinner) {
        spinner.fail(colors.error(message));
      }
    },
    
    stop() {
      if (spinner) {
        spinner.stop();
      }
    }
  };
}