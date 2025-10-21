import chalk from 'chalk';
import boxen from 'boxen';
import inquirer from 'inquirer';
import ora from 'ora';
import { join } from 'path';
import { homedir } from 'os';
import { analyzeKeywords } from '../analytics/analyzers/keyword-analyzer.js';

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

  // Background service status
  const serviceIcon = status.backgroundServiceRunning ? '✅' : status.backgroundServiceInstalled ? '⚠️' : '❌';
  const serviceStatus = status.backgroundServiceRunning
    ? colors.success(`${serviceIcon} Background Export: Running (every 60s)`)
    : status.backgroundServiceInstalled
      ? colors.warning(`${serviceIcon} Background Export: Installed but not running`)
      : colors.warning(`${serviceIcon} Background Export: Not installed`);
  statusLines.push(`  ⚙️  ${serviceStatus}`);

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

  // Background service management option
  if (status.backgroundServiceInstalled) {
    choices.push({
      name: `⚙️  ${colors.warning('Manage Background Export Service')} ${colors.dim('(running every 60s)')}`,
      value: 'manage_background_service',
      short: 'Background Service'
    });
  } else {
    choices.push({
      name: `⚙️  ${colors.success('Install Background Export Service')} ${colors.dim('(auto-export every minute)')}`,
      value: 'install_background_service',
      short: 'Install Background Service'
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
    choices.push({
      name: '🏆 View Achievements & Badges',
      value: 'view_achievements',
      short: 'Achievements'
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

  // Try to use the new analytics system
  let cache = null;
  try {
    const { AnalyticsManager } = await import('../analytics/analytics-manager.js');
    const manager = new AnalyticsManager();
    await manager.initialize();

    // Check if we need to compute analytics
    if (await manager.needsRebuild()) {
      const spinner = ora({
        text: 'Computing analytics...',
        color: 'cyan'
      }).start();

      await manager.computeAnalytics({
        progressCallback: (msg) => {
          spinner.text = msg;
        }
      });

      spinner.succeed('Analytics ready');
    }

    cache = manager.getCache();
  } catch (error) {
    // Fall back to basic analytics if new system fails
    console.warn('Using basic analytics (enhanced system unavailable)');
  }

  analyticsLines.push(colors.highlight('📊 CONVERSATION ANALYTICS'));
  analyticsLines.push('');

  // Use enhanced analytics if available
  if (cache && cache.overview.totalConversations > 0) {
    // Overview from cache
    analyticsLines.push(colors.info('📈 Your Coding Activity:'));
    analyticsLines.push(`  Total Conversations: ${colors.accent(cache.overview.totalConversations)}`);
    analyticsLines.push(`  Total Messages: ${colors.accent(cache.overview.totalMessages.toLocaleString())}`);

    if (cache.overview.dateRange && cache.overview.dateRange.first) {
      const firstDate = new Date(cache.overview.dateRange.first);
      const lastDate = new Date(cache.overview.dateRange.last);
      analyticsLines.push(`  Date Range: ${colors.dim(firstDate.toLocaleDateString())} to ${colors.dim(lastDate.toLocaleDateString())}`);
      analyticsLines.push(`  Active Days: ${colors.accent(cache.overview.dateRange.spanDays)}`);
    }

    analyticsLines.push('');

    // Conversation Stats
    analyticsLines.push(colors.info('💬 Conversation Stats:'));
    analyticsLines.push(`  Avg Messages/Conv: ${colors.accent(cache.conversationStats.avgMessagesPerConversation.toFixed(1))}`);
    analyticsLines.push(`  Median Messages: ${colors.accent(cache.conversationStats.medianMessagesPerConversation)}`);

    if (cache.conversationStats.longestConversation) {
      const longest = cache.conversationStats.longestConversation;

      // Decode project name
      let projectName = longest.project;
      if (projectName.startsWith('-Users-') || projectName.startsWith('Users-')) {
        const parts = projectName.replace(/^-/, '').split('-');
        if (parts.length >= 3) {
          projectName = parts.slice(3).join('-');
          if (!projectName && parts.length >= 2) {
            projectName = parts.slice(2).join('-');
          }
        }
      }
      if (!projectName || projectName.match(/^[a-z]+$/i)) {
        projectName = '~ (home)';
      }

      analyticsLines.push(`  Longest Conversation: ${colors.accent(longest.messages)} messages ${colors.dim(`(${projectName})`)}`);
    }

    analyticsLines.push('');

    // Project distribution from cache
    const sortedProjects = Object.entries(cache.conversationStats.byProject)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);

    if (sortedProjects.length > 0) {
      analyticsLines.push(colors.info('🏷️  Top Projects:'));

      for (const [project, stats] of sortedProjects) {
        // Decode project path to clean name
        let projectName = project;

        // Pattern: -Users-nathan-norman-toast-analytics → toast-analytics
        if (projectName.startsWith('-Users-') || projectName.startsWith('Users-')) {
          const parts = projectName.replace(/^-/, '').split('-');
          // Skip "Users" and next 1-2 parts (username), keep the rest
          if (parts.length >= 3) {
            // Try removing "Users" + 2 parts (handles nathan-norman)
            projectName = parts.slice(3).join('-');
            // If that left nothing, try removing just 1 part (handles single-name users)
            if (!projectName && parts.length >= 2) {
              projectName = parts.slice(2).join('-');
            }
          }
        }

        // If result is just a name, it's the home directory
        if (!projectName || projectName.match(/^[a-z]+$/i)) {
          projectName = '~ (home)';
        }

        // Truncate if too long
        projectName = projectName.length > 35 ? projectName.slice(0, 32) + '...' : projectName;

        const bar = '█'.repeat(Math.round((stats.count / cache.overview.totalConversations) * 20));
        analyticsLines.push(`  ${projectName}: ${bar} ${colors.dim(`(${stats.count} convs)`)}`);
      }
    }

    // Keyword Analytics Section
    if (cache && cache.overview.totalConversations > 0) {
      analyticsLines.push('');
      analyticsLines.push(colors.info('🏷️  Top Keywords:'));

      try {
        // Load conversations with keywords from search engine
        const { MiniSearchEngine } = await import('../search/minisearch-engine.js');
        const engine = new MiniSearchEngine();
        await engine.loadIndex();

        // Get all conversations with keywords
        const conversations = Array.from(engine.conversationData.values());

        // Analyze keywords
        const keywordAnalytics = analyzeKeywords(conversations);

        // Display top 10 keywords with bars
        if (keywordAnalytics.topKeywords.length > 0) {
          const maxCount = keywordAnalytics.topKeywords[0].count || 1;
          const barWidth = 20;

          for (const kw of keywordAnalytics.topKeywords.slice(0, 10)) {
            const barLength = Math.round((kw.count / maxCount) * barWidth);
            const bar = '█'.repeat(barLength);
            const paddedTerm = kw.term.padEnd(18);
            const countStr = kw.count.toString().padStart(4);
            analyticsLines.push(`  ${paddedTerm} ${colors.primary(bar)} ${colors.accent(countStr)}`);
          }

          analyticsLines.push('');

          // Show trending keywords if available
          if (keywordAnalytics.trends && keywordAnalytics.trends.length > 0) {
            analyticsLines.push(colors.info('📈 Trending Keywords:'));

            for (const trend of keywordAnalytics.trends.slice(0, 5)) {
              const arrow = trend.direction === 'up' ? '↗️' : trend.direction === 'down' ? '↘️' : '→';
              const changeColor = trend.direction === 'up' ? colors.success : trend.direction === 'down' ? colors.error : colors.dim;
              const sign = trend.changePercent > 0 ? '+' : '';
              analyticsLines.push(`  ${arrow} ${trend.keyword.padEnd(16)} ${changeColor(sign + trend.changePercent + '%')}`);
            }

            analyticsLines.push('');
          }

          // Show keyword coverage stats
          analyticsLines.push(colors.dim(`  ${keywordAnalytics.summary.uniqueKeywords} unique keywords across ${keywordAnalytics.summary.conversationsWithKeywords} conversations`));
          analyticsLines.push('');
        }
      } catch (error) {
        // Keyword analytics failed - don't block other analytics
        analyticsLines.push(colors.dim('  (Keyword analytics unavailable)'));
        analyticsLines.push('');
      }
    }

    // Comparative Analytics (if available)
    if (cache.comparative) {
      analyticsLines.push('');
      analyticsLines.push(colors.info('📊 Trends:'));

      // Week-over-week
      if (cache.comparative.weekOverWeek) {
        const wow = cache.comparative.weekOverWeek;
        const arrow = wow.trend === 'increasing' ? '▲' : wow.trend === 'decreasing' ? '▼' : '→';
        const changeColor = wow.trend === 'increasing' ? colors.success : wow.trend === 'decreasing' ? colors.error : colors.dim;
        analyticsLines.push(`  This Week vs Last: ${cache.comparative.weekOverWeek.thisWeek} vs ${wow.lastWeek} ${changeColor(`${arrow} ${wow.changePercent > 0 ? '+' : ''}${wow.changePercent}%`)}`);
      }

      // Personal bests
      if (cache.comparative.personalBests && Object.keys(cache.comparative.personalBests).length > 0) {
        const pb = cache.comparative.personalBests;
        if (pb.mostConversationsInWeek) {
          analyticsLines.push(`  Best Week: ${colors.accent(pb.mostConversationsInWeek)} conversations`);
        }
      }
    }
  } else {
    // Fallback to basic analytics
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
        analyticsLines.push(`  ${projectName}: ${bar} ${colors.dim(`(${count})`)}`);
      }
    }
  }

  analyticsLines.push('');

  // Time Patterns (if available from cache)
  if (cache && cache.timePatterns) {
    const { generateSparkline, generateTrendIndicator } = await import('../analytics/visualizers/sparklines.js');
    const { formatStreak, formatHour } = await import('../analytics/visualizers/formatters.js');
    const { generateActivityHeatmap } = await import('../analytics/visualizers/heatmap.js');

    analyticsLines.push(colors.info('⏰ Activity Patterns:'));

    // Streak information
    if (cache.timePatterns.streaks) {
      const { current, longest, longestPeriod } = cache.timePatterns.streaks;
      if (current > 0) {
        analyticsLines.push(`  Current Streak: ${colors.accent(formatStreak(current))}`);
      }
      if (longest > 0) {
        let longestText = `Longest Streak: ${colors.accent(formatStreak(longest))}`;
        if (longestPeriod) {
          longestText += ` ${colors.dim(`(${longestPeriod.start} to ${longestPeriod.end})`)}`;
        }
        analyticsLines.push(`  ${longestText}`);
      }
    }

    // Busiest times
    if (cache.timePatterns.busiestHour !== null) {
      analyticsLines.push(`  Busiest Hour: ${colors.accent(formatHour(cache.timePatterns.busiestHour))}`);
    }
    if (cache.timePatterns.busiestDay) {
      analyticsLines.push(`  Busiest Day: ${colors.accent(cache.timePatterns.busiestDay)}`);
    }

    // Active days
    if (cache.timePatterns.totalActiveDays) {
      analyticsLines.push(`  Total Active Days: ${colors.accent(cache.timePatterns.totalActiveDays)}`);
    }

    // Weekly trend with sparkline
    if (cache.timePatterns.weeklyTrend && cache.timePatterns.weeklyTrend.length > 0) {
      const sparkline = generateSparkline(cache.timePatterns.weeklyTrend);
      const trend = generateTrendIndicator(cache.timePatterns.weeklyTrend);
      analyticsLines.push(`  Weekly Trend (12w): ${sparkline} ${trend}`);
    }

    analyticsLines.push('');

    // Activity heatmap (compact version)
    if (cache.timePatterns.hourlyActivity && cache.timePatterns.dailyActivity) {
      analyticsLines.push(colors.info('📊 Activity Heatmap:'));
      analyticsLines.push(colors.dim('  When you code (day of week × hour of day)'));
      analyticsLines.push('');
      const heatmap = generateActivityHeatmap(
        cache.timePatterns.hourlyActivity,
        cache.timePatterns.dailyActivity,
        cache.timePatterns.dayHourMatrix // Use real day×hour data
      );
      const heatmapLines = heatmap.split('\n');
      for (const line of heatmapLines) {
        analyticsLines.push(`  ${line}`);
      }
      analyticsLines.push('');
      // Color-coded legend using chalk directly
      const chalk = (await import('chalk')).default;
      const legend = `  ${chalk.hex('#666666')('· none')}  ${chalk.hex('#0E4429')('░ low')}  ${chalk.hex('#006D32')('▒ medium')}  ${chalk.hex('#26A641')('▓ high')}  ${chalk.hex('#39D353').bold('█ peak')}`;
      analyticsLines.push(legend);
      analyticsLines.push(colors.dim('  (GitHub-style green gradient - darker to brighter)'));
    }

    analyticsLines.push('');
  }

  // User Actions (slash commands, hooks - what YOU do)
  if (cache && cache.userActions) {
    analyticsLines.push(colors.info('⚡ Your Actions:'));

    // Slash commands
    if (cache.userActions.slashCommands.total > 0) {
      analyticsLines.push(`  Slash Commands Used: ${colors.accent(cache.userActions.slashCommands.total)}`);

      if (cache.userActions.slashCommands.topCommands.length > 0) {
        const topCmds = cache.userActions.slashCommands.topCommands.slice(0, 3);
        for (const [cmd, count] of topCmds) {
          analyticsLines.push(`    ${colors.accent(cmd)}: ${colors.dim(count + ' times')}`);
        }
      }
    }

    // Hook executions
    if (cache.userActions.hooks.total > 0) {
      analyticsLines.push(`  Hooks Executed: ${colors.accent(cache.userActions.hooks.total)}`);

      if (cache.userActions.hooks.topHooks.length > 0) {
        const topHooks = cache.userActions.hooks.topHooks.slice(0, 3);
        for (const [hook, count] of topHooks) {
          const hookName = hook.replace(/-hook$/, '').replace(/-/g, ' ');
          analyticsLines.push(`    ${colors.accent(hookName)}: ${colors.dim(count + ' times')}`);
        }
      }
    }

    analyticsLines.push('');
  }

  // Productivity Metrics (if available from cache)
  if (cache && cache.productivityMetrics) {
    analyticsLines.push(colors.info('📈 Your Productivity:'));
    const pm = cache.productivityMetrics;

    if (pm.conversationsPerWeek > 0) {
      analyticsLines.push(`  Conversations/Week: ${colors.accent(pm.conversationsPerWeek)}`);
    }
    if (pm.messagesPerDay > 0) {
      analyticsLines.push(`  Messages/Day: ${colors.accent(pm.messagesPerDay)}`);
    }
    if (pm.avgSessionLength > 0) {
      const minutes = Math.floor(pm.avgSessionLength / 60);
      analyticsLines.push(`  Avg Session Length: ${colors.accent(minutes + ' min')}`);
    }
    if (pm.deepWorkSessions > 0 || pm.quickQuestions > 0) {
      analyticsLines.push(`  Deep Work: ${colors.accent(pm.deepWorkSessions)} sessions ${colors.dim('(>30 min)')}`);
      analyticsLines.push(`  Quick Questions: ${colors.accent(pm.quickQuestions)} sessions ${colors.dim('(<5 min)')}`);
    }
    if (pm.weekendActivity >= 0) {
      const weekdayPercent = ((1 - pm.weekendActivity) * 100).toFixed(1);
      analyticsLines.push(`  Work Schedule: ${colors.accent(weekdayPercent + '% weekdays')}, ${colors.dim((pm.weekendActivity * 100).toFixed(1) + '% weekends')}`);
    }

    analyticsLines.push('');
  }

  // Performance stats (always from status)
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

  // Offer export options if using enhanced analytics
  if (cache && cache.overview.totalConversations > 0) {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: colors.primary('What would you like to do?'),
        choices: [
          { name: '📤 Export Analytics', value: 'export' },
          { name: colors.dim('← Back to Menu'), value: 'back' }
        ]
      }
    ]);

    if (action === 'export') {
      await showExportMenu(cache, status);
    }
  } else {
    await inquirer.prompt([
      {
        type: 'input',
        name: 'continue',
        message: colors.dim('Press Enter to continue...')
      }
    ]);
  }
}

/**
 * Show achievements and badges
 * @param {Object} _status - Setup status (unused)
 */
export async function showAchievements(_status) {
  const achievementLines = [];

  // Try to load analytics
  let cache = null;
  try {
    const { AnalyticsManager } = await import('../analytics/analytics-manager.js');
    const manager = new AnalyticsManager();
    await manager.initialize();

    // Check if we need to compute analytics
    if (await manager.needsRebuild()) {
      const spinner = ora({
        text: 'Computing achievements...',
        color: 'cyan'
      }).start();

      await manager.computeAnalytics();
      spinner.succeed('Achievements ready');
    }

    cache = manager.getCache();
  } catch (error) {
    console.error(colors.error('Unable to load achievements'));
    await inquirer.prompt([{ type: 'input', name: 'continue', message: colors.dim('Press Enter to continue...') }]);
    return;
  }

  achievementLines.push(colors.highlight('🏆 ACHIEVEMENTS & BADGES'));
  achievementLines.push('');

  if (cache && cache.milestones) {
    // Show earned badges with descriptions
    if (cache.milestones.badges && cache.milestones.badges.length > 0) {
      const { getBadgeInfo } = await import('../analytics/analyzers/milestone-analyzer.js');
      achievementLines.push(colors.success(`✅ Badges Earned (${cache.milestones.badges.length}/17):`));
      achievementLines.push('');

      // Show all earned badges
      for (const badgeId of cache.milestones.badges) {
        const badge = getBadgeInfo(badgeId);
        if (badge) {
          achievementLines.push(`  ${badge.emoji}  ${colors.accent(badge.name)}`);
          achievementLines.push(`     ${colors.dim(badge.description)}`);
        }
      }
      achievementLines.push('');
    }

    // Show unearned badges
    const { getBadgeInfo } = await import('../analytics/analyzers/milestone-analyzer.js');
    const allBadgeIds = [
      'first_conversation', 'conversations_10', 'conversations_50', 'conversations_100', 'conversations_500',
      'streak_3', 'streak_7', 'streak_30',
      'early_bird', 'night_owl', 'weekend_warrior',
      'command_user', 'command_enthusiast', 'command_power_user', 'command_master', 'command_variety', 'automation_enthusiast',
      'deep_thinker', 'prolific_coder'
    ];

    const unearnedBadges = allBadgeIds.filter(id => !cache.milestones.badges.includes(id));

    if (unearnedBadges.length > 0) {
      achievementLines.push(colors.warning(`🔒 Badges to Unlock (${unearnedBadges.length} remaining):`));
      achievementLines.push('');

      for (const badgeId of unearnedBadges) {
        const badge = getBadgeInfo(badgeId);
        if (badge) {
          achievementLines.push(`  ${colors.dim(badge.emoji)}  ${colors.dim(badge.name)}`);
          achievementLines.push(`     ${colors.dim(badge.description)}`);
        }
      }
      achievementLines.push('');
    }

    // Show next milestones progress
    if (cache.milestones.nextMilestones && cache.milestones.nextMilestones.length > 0) {
      achievementLines.push(colors.info('🎯 Next Milestones:'));
      for (const next of cache.milestones.nextMilestones.slice(0, 3)) {
        const progressBar = '█'.repeat(Math.floor(next.percentage / 10)) + '░'.repeat(10 - Math.floor(next.percentage / 10));
        achievementLines.push(`  ${next.emoji} ${next.name}`);
        achievementLines.push(`     ${progressBar} ${colors.accent(`${next.progress}/${next.target}`)} ${colors.dim(`(${next.percentage}%)`)}`);
      }
      achievementLines.push('');
    }

    // Show key achievements
    if (cache.milestones.achievements) {
      achievementLines.push(colors.info('📊 Your Stats:'));
      const ach = cache.milestones.achievements;
      if (ach.totalWords > 0) {
        achievementLines.push(`  Estimated Words Written: ${colors.accent(ach.totalWords.toLocaleString())}`);
      }
      if (ach.projectsWorked > 0) {
        achievementLines.push(`  Projects Worked On: ${colors.accent(ach.projectsWorked)}`);
      }
      if (ach.commandsMastered && ach.commandsMastered.length > 0) {
        achievementLines.push(`  Commands Mastered (5+ uses): ${colors.accent(ach.commandsMastered.length)}`);
        const cmdList = ach.commandsMastered.slice(0, 5).join(', ');
        achievementLines.push(`    ${colors.dim(cmdList)}`);
      }
      if (ach.totalCustomCommands > 0) {
        achievementLines.push(`  Total Custom Commands: ${colors.accent(ach.totalCustomCommands)}`);
      }
    }
  }

  console.log(boxen(achievementLines.join('\n'), {
    padding: 1,
    margin: 1,
    borderStyle: 'round',
    borderColor: 'yellow'
  }));

  await inquirer.prompt([
    {
      type: 'input',
      name: 'continue',
      message: colors.dim('Press Enter to continue...')
    }
  ]);
}

/**
 * Show export options menu
 * @param {Object} cache - Analytics cache
 * @param {Object} status - Setup status
 */
async function showExportMenu(cache, status) {
  const { format } = await inquirer.prompt([
    {
      type: 'list',
      name: 'format',
      message: colors.primary('Choose export format:'),
      choices: [
        { name: '📄 Markdown Report (human-readable)', value: 'markdown' },
        { name: '📊 JSON (machine-readable)', value: 'json' },
        { name: '📈 CSV (spreadsheet-ready)', value: 'csv' },
        { name: colors.dim('← Cancel'), value: 'cancel' }
      ]
    }
  ]);

  if (format === 'cancel') {
    return;
  }

  // Get export directory
  const exportDir = status.config?.exportDirectory || join(homedir(), '.claude', 'claude_conversations', 'analytics');

  const spinner = ora({
    text: `Exporting to ${format.toUpperCase()}...`,
    color: 'cyan'
  }).start();

  try {
    let exportedPaths = [];

    if (format === 'json') {
      const { exportToJSON } = await import('../analytics/exporters/json-exporter.js');
      const path = await exportToJSON(cache, { outputDir: exportDir });
      exportedPaths.push(path);
    } else if (format === 'markdown') {
      const { exportToMarkdown } = await import('../analytics/exporters/markdown-exporter.js');
      const path = await exportToMarkdown(cache, { outputDir: exportDir });
      exportedPaths.push(path);
    } else if (format === 'csv') {
      const { exportToCSV } = await import('../analytics/exporters/csv-exporter.js');
      exportedPaths = await exportToCSV(cache, { outputDir: exportDir });
    }

    spinner.succeed(`Exported analytics to ${format.toUpperCase()}`);
    console.log('');
    console.log(colors.success('✅ Export completed:'));
    for (const path of exportedPaths) {
      console.log(colors.dim(`   ${path}`));
    }
    console.log('');

    await inquirer.prompt([
      {
        type: 'input',
        name: 'continue',
        message: colors.dim('Press Enter to continue...')
      }
    ]);
  } catch (error) {
    spinner.fail('Export failed');
    console.error(colors.error(`Error: ${error.message}`));

    await inquirer.prompt([
      {
        type: 'input',
        name: 'continue',
        message: colors.dim('Press Enter to continue...')
      }
    ]);
  }
}

export async function confirmExportLocation() {
  // First, offer common locations or custom
  const { choice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'choice',
      message: colors.primary('Choose export location:'),
      choices: [
        {
          name: `📁 Default: ${colors.dim('~/.claude/claude_conversations')}`,
          value: join(homedir(), '.claude', 'claude_conversations')
        },
        {
          name: `📁 Documents: ${colors.dim('~/Documents/claude_conversations')}`,
          value: join(homedir(), 'Documents', 'claude_conversations')
        },
        {
          name: `📁 Desktop: ${colors.dim('~/Desktop/claude_conversations')}`,
          value: join(homedir(), 'Desktop', 'claude_conversations')
        },
        {
          name: '📝 Custom path (enter manually)...',
          value: 'custom'
        },
        {
          name: colors.dim('← Cancel (keep current location)'),
          value: 'cancel'
        }
      ]
    }
  ]);

  // Handle cancel
  if (choice === 'cancel') {
    return null;
  }

  // If custom, prompt for path
  if (choice === 'custom') {
    const { location } = await inquirer.prompt([
      {
        type: 'input',
        name: 'location',
        message: colors.primary('Enter export location path:'),
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

  // Return selected preset location
  return choice;
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