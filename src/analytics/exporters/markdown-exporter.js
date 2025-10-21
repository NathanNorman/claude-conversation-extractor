/**
 * Markdown Exporter
 *
 * Exports analytics data as formatted Markdown reports.
 * Creates human-readable reports with sections and visualizations.
 */

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { formatStreak, formatHour, formatNumber } from '../visualizers/formatters.js';
import { generateSparkline } from '../visualizers/sparklines.js';
import { getBadgeInfo } from '../analyzers/milestone-analyzer.js';

/**
 * Export analytics cache to Markdown report
 * @param {Object} cache - Analytics cache
 * @param {Object} options - Export options
 * @returns {Promise<string>} Path to exported file
 */
export async function exportToMarkdown(cache, options = {}) {
  const {
    outputDir = './',
    filename = 'analytics-report.md',
    includeTimestamp = true,
    sections = ['all']
  } = options;

  const lines = [];

  // Header
  lines.push('# Claude Conversation Analytics Report');
  lines.push('');
  lines.push(`**Generated**: ${new Date().toLocaleString()}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Overview
  if (sections.includes('all') || sections.includes('overview')) {
    lines.push(...generateOverviewSection(cache));
  }

  // Time Patterns
  if (sections.includes('all') || sections.includes('time')) {
    lines.push(...generateTimeSection(cache));
  }

  // Tool Usage
  if (sections.includes('all') || sections.includes('tools')) {
    lines.push(...generateToolSection(cache));
  }

  // Productivity
  if (sections.includes('all') || sections.includes('productivity')) {
    lines.push(...generateProductivitySection(cache));
  }

  // Milestones
  if (sections.includes('all') || sections.includes('milestones')) {
    lines.push(...generateMilestonesSection(cache));
  }

  // Projects
  if (sections.includes('all') || sections.includes('projects')) {
    lines.push(...generateProjectsSection(cache));
  }

  // Keywords
  if (sections.includes('all') || sections.includes('keywords')) {
    lines.push(...generateKeywordsSection(cache));
  }

  const markdownContent = lines.join('\n');

  // Generate filename with timestamp if requested
  const finalFilename = includeTimestamp
    ? filename.replace('.md', `-${Date.now()}.md`)
    : filename;

  const outputPath = join(outputDir, finalFilename);

  // Ensure directory exists
  await mkdir(outputDir, { recursive: true });

  await writeFile(outputPath, markdownContent, 'utf8');

  return outputPath;
}

/**
 * Generate overview section
 */
function generateOverviewSection(cache) {
  const lines = [];
  lines.push('## 📊 Overview');
  lines.push('');

  if (cache.overview) {
    lines.push(`- **Total Conversations**: ${formatNumber(cache.overview.totalConversations)}`);
    lines.push(`- **Total Messages**: ${formatNumber(cache.overview.totalMessages)}`);
    lines.push(`- **Total Tool Uses**: ${formatNumber(cache.overview.totalToolInvocations)}`);

    if (cache.overview.dateRange) {
      lines.push(`- **Date Range**: ${cache.overview.dateRange.spanDays} days`);
      lines.push(`- **First Activity**: ${new Date(cache.overview.dateRange.first).toLocaleDateString()}`);
      lines.push(`- **Last Activity**: ${new Date(cache.overview.dateRange.last).toLocaleDateString()}`);
    }
  }

  if (cache.conversationStats) {
    lines.push('');
    lines.push('### Conversation Statistics');
    lines.push('');
    lines.push(`- **Average Messages per Conversation**: ${cache.conversationStats.avgMessagesPerConversation.toFixed(1)}`);
    lines.push(`- **Median Messages**: ${cache.conversationStats.medianMessagesPerConversation}`);

    if (cache.conversationStats.longestConversation) {
      const longest = cache.conversationStats.longestConversation;
      lines.push(`- **Longest Conversation**: ${longest.messages} messages (${longest.project})`);
    }
  }

  lines.push('');
  lines.push('---');
  lines.push('');

  return lines;
}

/**
 * Generate time patterns section
 */
function generateTimeSection(cache) {
  const lines = [];
  lines.push('## ⏰ Activity Patterns');
  lines.push('');

  if (cache.timePatterns) {
    const tp = cache.timePatterns;

    if (tp.streaks) {
      lines.push('### Streaks');
      lines.push('');
      lines.push(`- **Current Streak**: ${formatStreak(tp.streaks.current)}`);
      lines.push(`- **Longest Streak**: ${formatStreak(tp.streaks.longest)}`);
      if (tp.streaks.longestPeriod) {
        lines.push(`  - ${tp.streaks.longestPeriod.start} to ${tp.streaks.longestPeriod.end}`);
      }
      lines.push('');
    }

    if (tp.busiestHour !== null || tp.busiestDay) {
      lines.push('### Peak Activity Times');
      lines.push('');
      if (tp.busiestHour !== null) {
        lines.push(`- **Busiest Hour**: ${formatHour(tp.busiestHour)}`);
      }
      if (tp.busiestDay) {
        lines.push(`- **Busiest Day**: ${tp.busiestDay}`);
      }
      lines.push(`- **Total Active Days**: ${tp.totalActiveDays}`);
      lines.push('');
    }

    if (tp.weeklyTrend && tp.weeklyTrend.length > 0) {
      lines.push('### Weekly Trend (Last 12 Weeks)');
      lines.push('');
      lines.push('```');
      lines.push(generateSparkline(tp.weeklyTrend));
      lines.push('```');
      lines.push('');
      lines.push(`Values: ${tp.weeklyTrend.join(', ')}`);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');

  return lines;
}

/**
 * Generate tool usage section
 */
function generateToolSection(cache) {
  const lines = [];
  lines.push('## 🛠️ Tool Usage');
  lines.push('');

  if (cache.toolUsage && cache.toolUsage.total > 0) {
    lines.push(`**Total Tool Uses**: ${formatNumber(cache.toolUsage.total)}`);
    lines.push('');

    // Top 10 tools
    const sortedTools = Object.entries(cache.toolUsage.byTool)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    if (sortedTools.length > 0) {
      lines.push('### Most Used Tools');
      lines.push('');
      lines.push('| Tool | Count | Percentage |');
      lines.push('|------|------:|----------:|');

      for (const [tool, count] of sortedTools) {
        const percentage = ((count / cache.toolUsage.total) * 100).toFixed(1);
        lines.push(`| ${tool} | ${formatNumber(count)} | ${percentage}% |`);
      }
      lines.push('');
    }

    // Tool combinations
    if (cache.toolUsage.combinations && cache.toolUsage.combinations.length > 0) {
      lines.push('### Common Tool Combinations');
      lines.push('');
      lines.push('| Combination | Count |');
      lines.push('|-------------|------:|');

      for (const combo of cache.toolUsage.combinations.slice(0, 5)) {
        lines.push(`| ${combo.tools.join(' → ')} | ${combo.count} |`);
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');

  return lines;
}

/**
 * Generate productivity section
 */
function generateProductivitySection(cache) {
  const lines = [];
  lines.push('## 📈 Productivity Metrics');
  lines.push('');

  if (cache.productivityMetrics) {
    const pm = cache.productivityMetrics;

    lines.push('### Activity Rates');
    lines.push('');
    lines.push(`- **Conversations per Week**: ${pm.conversationsPerWeek}`);
    lines.push(`- **Messages per Day**: ${pm.messagesPerDay}`);
    lines.push(`- **Tools per Conversation**: ${pm.toolsPerConversation}`);
    lines.push('');

    lines.push('### Session Analysis');
    lines.push('');
    lines.push(`- **Average Session Length**: ${Math.floor(pm.avgSessionLength / 60)} minutes`);
    lines.push(`- **Deep Work Sessions**: ${pm.deepWorkSessions} (>30 minutes)`);
    lines.push(`- **Quick Questions**: ${pm.quickQuestions} (<5 minutes)`);
    lines.push('');

    lines.push('### Work Schedule');
    lines.push('');
    lines.push(`- **Weekend Activity**: ${(pm.weekendActivity * 100).toFixed(1)}%`);
    lines.push(`- **Weekday Activity**: ${((1 - pm.weekendActivity) * 100).toFixed(1)}%`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  return lines;
}

/**
 * Generate milestones section
 */
function generateMilestonesSection(cache) {
  const lines = [];
  lines.push('## 🏆 Milestones & Achievements');
  lines.push('');

  if (cache.milestones) {
    // Badges
    if (cache.milestones.badges && cache.milestones.badges.length > 0) {
      lines.push('### Badges Earned');
      lines.push('');

      for (const badgeId of cache.milestones.badges) {
        const badge = getBadgeInfo(badgeId);
        if (badge) {
          lines.push(`- ${badge.emoji} **${badge.name}**: ${badge.description}`);
        }
      }
      lines.push('');
    }

    // Next milestones
    if (cache.milestones.nextMilestones && cache.milestones.nextMilestones.length > 0) {
      lines.push('### Next Milestones');
      lines.push('');

      for (const milestone of cache.milestones.nextMilestones) {
        const progress = '█'.repeat(Math.floor(milestone.percentage / 10)) +
                        '░'.repeat(10 - Math.floor(milestone.percentage / 10));
        lines.push(`- ${milestone.emoji} **${milestone.name}**: ${progress} ${milestone.progress}/${milestone.target} (${milestone.percentage}%)`);
      }
      lines.push('');
    }

    // Achievements
    if (cache.milestones.achievements) {
      const ach = cache.milestones.achievements;
      lines.push('### Achievements');
      lines.push('');
      lines.push(`- **Estimated Total Words**: ${formatNumber(ach.totalWords)}`);
      lines.push(`- **Projects Worked**: ${ach.projectsWorked}`);
      if (ach.toolsMastered && ach.toolsMastered.length > 0) {
        lines.push(`- **Tools Mastered**: ${ach.toolsMastered.join(', ')}`);
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');

  return lines;
}

/**
 * Generate projects section
 */
function generateProjectsSection(cache) {
  const lines = [];
  lines.push('## 📁 Projects');
  lines.push('');

  if (cache.conversationStats?.byProject) {
    const projects = Object.entries(cache.conversationStats.byProject)
      .sort((a, b) => b[1].count - a[1].count);

    if (projects.length > 0) {
      lines.push('| Project | Conversations | Total Messages | Avg Messages |');
      lines.push('|---------|-------------:|---------------:|-------------:|');

      for (const [project, stats] of projects) {
        const projectName = project.length > 40 ? project.slice(0, 37) + '...' : project;
        lines.push(`| ${projectName} | ${stats.count} | ${formatNumber(stats.totalMessages)} | ${stats.avgMessages.toFixed(1)} |`);
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');

  return lines;
}

/**
 * Generate keyword analytics section
 */
function generateKeywordsSection(cache) {
  const lines = [];

  if (!cache.keywords) {
    return lines;
  }

  lines.push('## 🏷️ Keyword Analytics');
  lines.push('');

  // Top Keywords subsection
  if (cache.keywords.topKeywords && cache.keywords.topKeywords.length > 0) {
    lines.push('### Top Keywords');
    lines.push('');
    lines.push('| Rank | Keyword | Count | Percentage |');
    lines.push('|------|---------|-------|-----------|');

    for (let i = 0; i < Math.min(20, cache.keywords.topKeywords.length); i++) {
      const kw = cache.keywords.topKeywords[i];
      lines.push(`| ${i + 1} | ${kw.term} | ${kw.count} | ${kw.percentage}% |`);
    }
    lines.push('');
  }

  // Keywords by Project subsection
  if (cache.keywords.topKeywordsByProject && Object.keys(cache.keywords.topKeywordsByProject).length > 0) {
    lines.push('### Keywords by Project');
    lines.push('');

    for (const [project, keywords] of Object.entries(cache.keywords.topKeywordsByProject)) {
      if (Array.isArray(keywords) && keywords.length > 0) {
        const topKeywords = keywords.slice(0, 5).map(k => k.term).join(', ');
        lines.push(`- **${project}**: ${topKeywords}`);
      }
    }
    lines.push('');
  }

  // Trending Keywords subsection
  if (cache.keywords.trends && cache.keywords.trends.length > 0) {
    lines.push('### Trending Keywords');
    lines.push('');

    for (const trend of cache.keywords.trends.slice(0, 5)) {
      const arrow = trend.direction === 'up' ? '↗️' : trend.direction === 'down' ? '↘️' : '→';
      const sign = trend.changePercent > 0 ? '+' : '';
      lines.push(`${arrow} **${trend.keyword}** (${sign}${trend.changePercent}%)`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  return lines;
}
