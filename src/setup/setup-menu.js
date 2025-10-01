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

  // Check if we have an archive index (significantly more indexed than active JSONL files)
  const hasArchiveIndex = status.config.conversationsIndexed > status.conversationCount * 2;

  // Extract status - skip if we have an archive index
  if (!hasArchiveIndex) {
    const extractIcon = status.extractedAll ? '✅' : status.extractedCount > 0 ? '🔄' : '❌';
    const extractStatus = status.extractedAll
      ? colors.success(`${extractIcon} Extract All: Complete (${status.extractedCount}/${status.conversationCount} files)`)
      : status.extractedCount > 0
        ? colors.warning(`${extractIcon} Extract All: Partial (${status.extractedCount}/${status.conversationCount} files, ${status.needsExtractionCount || 0} need updating)`)
        : colors.warning(`${extractIcon} Extract All: Not started (0/${status.conversationCount} files)`);
    statusLines.push(`  ${extractStatus}`);
  }

  // Show searchable conversations count
  if (hasArchiveIndex && status.config.conversationsIndexed > 0) {
    statusLines.push(`  ${colors.success('📚 Searchable Conversations:')} ${colors.highlight(status.config.conversationsIndexed + ' total')}`);
  }

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

  // Search index status
  let searchIndexStatus;
  if (status.indexBuilt) {
    searchIndexStatus = '✅ Ready (20ms search)';
  } else if (status.indexOutdated) {
    searchIndexStatus = '⚠️  Needs rebuild';
  } else {
    searchIndexStatus = '❌ Not built';
  }
  statusLines.push(`  ⚡ Search Index: ${colors.accent(searchIndexStatus)}`);

  // Hook status
  const hookIcon = status.hookInstalled ? '✅' : '❌';
  const hookStatus = status.hookInstalled
    ? colors.success(`${hookIcon} Auto-Export Hook: Installed`)
    : colors.warning(`${hookIcon} Auto-Export Hook: Not installed`);
  statusLines.push(`  🔗 ${hookStatus}`);

  // Slash command status
  const commandIcon = status.rememberCommandInstalled ? '✅' : '❌';
  const commandStatus = status.rememberCommandInstalled
    ? colors.success(`${commandIcon} /remember Command: Installed`)
    : colors.warning(`${commandIcon} /remember Command: Not installed`);
  statusLines.push(`  ⚡ ${commandStatus}`);

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

  // Check if any setup is needed
  // Even with archive index, we should still offer extraction if conversations need it
  const needsAnySetup = status.needsExtraction || status.needsIndexing;

  // If everything is ready, offer to go straight to search
  if (!needsAnySetup) {
    choices.push({
      name: `🔍 ${colors.success('Start Searching')} ${colors.dim('(everything is ready!)')}`,
      value: 'skip_setup',
      short: 'Search'
    });
  }

  // Setup options
  if (status.needsExtraction) {
    const extractText = status.needsExtractionCount > 0 && status.needsExtractionCount < status.conversationCount
      ? `Extract ${status.needsExtractionCount} New Conversations`
      : 'Extract All Conversations';
    choices.push({
      name: `📤 ${colors.success(extractText)}`,
      value: 'extract_only',
      short: 'Extract'
    });
  }

  if (status.needsIndexing) {
    const indexAction = status.indexOutdated ? 'Rebuild Search Index' : 'Build Search Index';
    choices.push({
      name: `🗂️  ${colors.success(indexAction)}`,
      value: 'index_only',
      short: 'Index'
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

  // Hook management option
  if (status.hookInstalled) {
    choices.push({
      name: `🔗 ${colors.warning('Uninstall Auto-Export Hook')} ${colors.dim('(remove SessionEnd hook)')}`,
      value: 'uninstall_hook',
      short: 'Uninstall Hook'
    });
  } else {
    choices.push({
      name: `🔗 ${colors.success('Install Auto-Export Hook')} ${colors.dim('(auto-export on session end)')}`,
      value: 'install_hook',
      short: 'Install Hook'
    });
  }

  // Slash command management option
  if (status.rememberCommandInstalled) {
    choices.push({
      name: `⚡ ${colors.warning('Uninstall /remember Command')} ${colors.dim('(remove slash command)')}`,
      value: 'uninstall_remember',
      short: 'Uninstall /remember'
    });
  } else {
    choices.push({
      name: `⚡ ${colors.success('Install /remember Command')} ${colors.dim('(search past conversations)')}`,
      value: 'install_remember',
      short: 'Install /remember'
    });
  }

  // Analytics option (if we have data)
  if (status.extractedCount > 0) {
    choices.push({
      name: '📊 View Conversation Analytics',
      value: 'view_analytics',
      short: 'Analytics'
    });
  }
  
  
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

/**
 * SetupMenu class for managing setup interactions
 */
class SetupMenu {
  constructor(options = {}) {
    this.setupManager = options.setupManager;
    this.inquirer = options.inquirer || inquirer;
    this.logger = options.logger || console;
  }

  async show() {
    const status = await this.setupManager.getSetupStatus();
    return await this.showSetupMenu(status);
  }

  async showSetupMenu(status) {
    console.clear();
    
    // Build status display
    const statusLines = [];
    
    // Header
    statusLines.push(colors.highlight('CLAUDE CONVERSATION EXTRACTOR - SETUP STATUS'));
    statusLines.push('');
    
    // Current Status
    statusLines.push(colors.info('📊 Current Status:'));
    
    // Extract status with more accurate detection
    const extractIcon = status.extractedAll ? '✅' : status.extractedCount > 0 ? '🔄' : '❌';
    const extractStatus = status.extractedAll 
      ? colors.success(`${extractIcon} Extract All: Complete (${status.extractedCount}/${status.conversationCount} files)`)
      : status.extractedCount > 0
        ? colors.warning(`${extractIcon} Extract All: Partial (${status.extractedCount}/${status.conversationCount} files, ${status.needsExtractionCount || 0} need updating)`)
        : colors.warning(`${extractIcon} Extract All: Not started (0/${status.conversationCount} files)`);
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
    
    // Search index status
    let searchIndexStatus;
    if (status.indexBuilt) {
      searchIndexStatus = '✅ Ready (20ms search)';
    } else if (status.indexOutdated) {
      searchIndexStatus = '⚠️  Needs rebuild';
    } else {
      searchIndexStatus = '❌ Not built';
    }
    statusLines.push(`  ⚡ Search Index: ${colors.accent(searchIndexStatus)}`);
    
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
    
    // If everything is ready, offer to go straight to search
    if (!status.needsExtraction && !status.needsIndexing) {
      choices.push({
        name: `🔍 ${colors.success('Start Searching')} ${colors.dim('(everything is ready!)')}`,
        value: 'skip_setup',
        short: 'Search'
      });
      const SeparatorClass = this.inquirer.Separator || inquirer.Separator;
      choices.push(new SeparatorClass(colors.dim('─────── Maintenance ───────')));
    }
    
    // Quick setup option (if needed)
    if (status.needsExtraction || status.needsIndexing) {
      const actions = [];
      if (status.needsExtraction) {
        actions.push(status.needsExtractionCount > 0 ? `Update ${status.needsExtractionCount} conversations` : 'Extract');
      }
      if (status.needsIndexing) {
        actions.push(status.indexOutdated ? 'Rebuild Index' : 'Build Index');
      }
      const timeEstimate = status.needsExtraction && status.needsIndexing ? '~3 min' : 
        status.needsExtraction ? '~2 min' : '~30 sec';
      choices.push({
        name: `🚀 ${colors.success('Quick Setup')} (${actions.join(' + ')}) ${colors.dim(timeEstimate)}`,
        value: 'quick_setup',
        short: 'Quick Setup'
      });
    }
    
    // Individual options
    if (status.needsExtraction) {
      const extractText = status.needsExtractionCount > 0 && status.needsExtractionCount < status.conversationCount
        ? `Update ${status.needsExtractionCount} Conversations`
        : 'Extract All Conversations';
      const timeEstimate = status.needsExtractionCount > 0 
        ? `~${Math.ceil(status.needsExtractionCount * 0.8)} sec`
        : '~2 min';
      choices.push({
        name: `📤 ${extractText} Only ${colors.dim(`(${timeEstimate})`)}`,
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
    const SeparatorClass2 = this.inquirer.Separator || inquirer.Separator;
    choices.push(
      new SeparatorClass2(colors.dim('─────── Advanced Options ───────')),
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
    
    // Skip setup option (only if setup is needed)
    if (status.needsExtraction || status.needsIndexing) {
      choices.push({
        name: `⏭️  Skip Setup ${colors.dim('(use basic search mode)')}`,
        value: 'skip_setup',
        short: 'Skip'
      });
    }
    
    // Exit option
    choices.push({
      name: colors.error('❌ Exit'),
      value: 'exit',
      short: 'Exit'
    });
    
    // Show menu
    const { choice } = await this.inquirer.prompt([
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

  async runInitialSetup() {
    const BulkExtractor = (await import('./bulk-extractor.js')).default;
    const IndexBuilder = (await import('./index-builder.js')).default;

    // Extract conversations
    const extractor = new BulkExtractor({
      projectsDir: this.setupManager.projectsDir,
      outputDir: this.setupManager.exportDir
    });
    
    const extractResult = await extractor.extractAll();
    await this.setupManager.markExtractionComplete(extractResult.extracted);

    // Build index
    const indexBuilder = new IndexBuilder({
      projectsDir: this.setupManager.projectsDir,
      indexPath: this.setupManager.indexPath
    });
    
    const indexResult = await indexBuilder.build();
    await this.setupManager.markIndexBuildComplete(indexResult.documentCount);

    // Mark setup complete
    this.setupManager.setSetupComplete(true);
    await this.setupManager.saveConfig(this.setupManager.config);

    return { success: true };
  }

  async runExtraction() {
    const BulkExtractor = (await import('./bulk-extractor.js')).default;
    
    const extractor = new BulkExtractor({
      projectsDir: this.setupManager.projectsDir,
      outputDir: this.setupManager.exportDir
    });
    
    const result = await extractor.extractAll();
    await this.setupManager.markExtractionComplete(result.extracted);
    
    return result;
  }

  async runIndexBuild() {
    const IndexBuilder = (await import('./index-builder.js')).default;
    
    const indexBuilder = new IndexBuilder({
      projectsDir: this.setupManager.projectsDir,
      indexPath: this.setupManager.indexPath
    });
    
    const result = await indexBuilder.build();
    await this.setupManager.markIndexBuildComplete(result.documentCount);
    
    return result;
  }

  async showStatistics() {
    const status = await this.setupManager.getSetupStatus();
    await this.showAnalytics(status);
  }

  async showAnalytics(status) {
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
    
    await this.inquirer.prompt([
      {
        type: 'input',
        name: 'continue',
        message: colors.dim('Press Enter to continue...')
      }
    ]);
  }

  async getExportDirectory() {
    const { confirm } = await this.inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Continue with export directory selection?',
        default: true
      }
    ]);

    if (!confirm) {
      return null;
    }

    return await confirmExportLocation();
  }

  async configureSettings() {
    const { value } = await this.inquirer.prompt([
      {
        type: 'input',
        name: 'value',
        message: 'Enter new export directory:',
        default: this.setupManager.exportDir
      }
    ]);

    this.setupManager.setExportDirectory(value);
    await this.setupManager.saveConfig(this.setupManager.config);
  }
}

export { SetupMenu };
export default SetupMenu;