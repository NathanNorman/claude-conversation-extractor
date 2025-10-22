/**
 * CSV Exporter
 *
 * Exports analytics data in CSV format for spreadsheet analysis.
 * Creates multiple CSV files for different data types.
 */

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

/**
 * Export analytics to CSV files
 * @param {Object} cache - Analytics cache
 * @param {Object} options - Export options
 * @returns {Promise<Array<string>>} Paths to exported files
 */
export async function exportToCSV(cache, options = {}) {
  const {
    outputDir = './',
    prefix = 'analytics',
    includeTimestamp = true
  } = options;

  const timestamp = includeTimestamp ? `-${Date.now()}` : '';
  const exportedFiles = [];

  // Ensure directory exists
  await mkdir(outputDir, { recursive: true });

  // Export overview/summary
  if (cache.overview) {
    const path = await exportOverviewCSV(cache, join(outputDir, `${prefix}-overview${timestamp}.csv`));
    exportedFiles.push(path);
  }

  // Export tool usage
  if (cache.toolUsage?.byTool) {
    const path = await exportToolUsageCSV(cache.toolUsage, join(outputDir, `${prefix}-tools${timestamp}.csv`));
    exportedFiles.push(path);
  }

  // Export projects
  if (cache.conversationStats?.byProject) {
    const path = await exportProjectsCSV(cache.conversationStats.byProject, join(outputDir, `${prefix}-projects${timestamp}.csv`));
    exportedFiles.push(path);
  }

  // Export time patterns (hourly/daily)
  if (cache.timePatterns) {
    const path = await exportTimePatternsCSV(cache.timePatterns, join(outputDir, `${prefix}-time${timestamp}.csv`));
    exportedFiles.push(path);
  }

  // Export keywords
  if (cache.keywords) {
    const path = await exportKeywordsCSV(cache.keywords, join(outputDir, `${prefix}-keywords${timestamp}.csv`));
    exportedFiles.push(path);
  }

  return exportedFiles;
}

/**
 * Export overview data to CSV
 */
async function exportOverviewCSV(cache, outputPath) {
  const lines = [];

  // Header
  lines.push('Metric,Value');

  // Overview metrics
  if (cache.overview) {
    lines.push(`Total Conversations,${cache.overview.totalConversations}`);
    lines.push(`Total Messages,${cache.overview.totalMessages}`);
    lines.push(`Total Tool Invocations,${cache.overview.totalToolInvocations}`);

    if (cache.overview.dateRange) {
      lines.push(`Date Range (days),${cache.overview.dateRange.spanDays}`);
      lines.push(`First Activity,${cache.overview.dateRange.first}`);
      lines.push(`Last Activity,${cache.overview.dateRange.last}`);
    }
  }

  // Conversation stats
  if (cache.conversationStats) {
    lines.push(`Avg Messages per Conversation,${cache.conversationStats.avgMessagesPerConversation.toFixed(2)}`);
    lines.push(`Median Messages,${cache.conversationStats.medianMessagesPerConversation}`);
  }

  // Productivity metrics
  if (cache.productivityMetrics) {
    const pm = cache.productivityMetrics;
    lines.push(`Conversations per Week,${pm.conversationsPerWeek}`);
    lines.push(`Messages per Day,${pm.messagesPerDay}`);
    lines.push(`Tools per Conversation,${pm.toolsPerConversation}`);
    lines.push(`Avg Session Length (seconds),${pm.avgSessionLength}`);
    lines.push(`Deep Work Sessions,${pm.deepWorkSessions}`);
    lines.push(`Quick Questions,${pm.quickQuestions}`);
    lines.push(`Weekend Activity Ratio,${pm.weekendActivity}`);
  }

  // Time patterns
  if (cache.timePatterns) {
    const tp = cache.timePatterns;
    lines.push(`Current Streak,${tp.streaks?.current || 0}`);
    lines.push(`Longest Streak,${tp.streaks?.longest || 0}`);
    lines.push(`Busiest Hour,${tp.busiestHour}`);
    lines.push(`Busiest Day,${tp.busiestDay || ''}`);
    lines.push(`Total Active Days,${tp.totalActiveDays}`);
  }

  await writeFile(outputPath, lines.join('\n'), 'utf8');
  return outputPath;
}

/**
 * Export tool usage to CSV
 */
async function exportToolUsageCSV(toolUsage, outputPath) {
  const lines = [];

  // Header
  lines.push('Tool,Count,Percentage');

  // Sort tools by count
  const sortedTools = Object.entries(toolUsage.byTool)
    .sort((a, b) => b[1] - a[1]);

  for (const [tool, count] of sortedTools) {
    const percentage = ((count / toolUsage.total) * 100).toFixed(2);
    lines.push(`${tool},${count},${percentage}`);
  }

  await writeFile(outputPath, lines.join('\n'), 'utf8');
  return outputPath;
}

/**
 * Export projects to CSV
 */
async function exportProjectsCSV(byProject, outputPath) {
  const lines = [];

  // Header
  lines.push('Project,Conversations,Total Messages,Avg Messages');

  // Sort projects by conversation count
  const sortedProjects = Object.entries(byProject)
    .sort((a, b) => b[1].count - a[1].count);

  for (const [project, stats] of sortedProjects) {
    // Escape project name if it contains commas
    const projectName = project.includes(',') ? `"${project}"` : project;
    lines.push(`${projectName},${stats.count},${stats.totalMessages},${stats.avgMessages.toFixed(2)}`);
  }

  await writeFile(outputPath, lines.join('\n'), 'utf8');
  return outputPath;
}

/**
 * Export time patterns to CSV
 */
async function exportTimePatternsCSV(timePatterns, outputPath) {
  const lines = [];

  // Hourly activity
  lines.push('Hour,Activity Count');
  if (timePatterns.hourlyActivity) {
    for (let hour = 0; hour < 24; hour++) {
      lines.push(`${hour},${timePatterns.hourlyActivity[hour]}`);
    }
  }

  lines.push('');
  lines.push('Day,Activity Count');

  // Daily activity
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  if (timePatterns.dailyActivity) {
    for (let day = 0; day < 7; day++) {
      lines.push(`${dayNames[day]},${timePatterns.dailyActivity[day]}`);
    }
  }

  lines.push('');
  lines.push('Week,Activity Count');

  // Weekly trend
  if (timePatterns.weeklyTrend) {
    for (let week = 0; week < timePatterns.weeklyTrend.length; week++) {
      lines.push(`Week ${week + 1},${timePatterns.weeklyTrend[week]}`);
    }
  }

  lines.push('');
  lines.push('Month,Activity Count');

  // Monthly trend
  if (timePatterns.monthlyTrend) {
    for (let month = 0; month < timePatterns.monthlyTrend.length; month++) {
      lines.push(`Month ${month + 1},${timePatterns.monthlyTrend[month]}`);
    }
  }

  await writeFile(outputPath, lines.join('\n'), 'utf8');
  return outputPath;
}

/**
 * Export keywords to CSV
 */
async function exportKeywordsCSV(keywords, outputPath) {
  const lines = [];

  // Top Keywords section
  lines.push('TOP KEYWORDS');
  lines.push('Keyword,Count,Percentage');

  if (keywords.topKeywords && keywords.topKeywords.length > 0) {
    for (const kw of keywords.topKeywords) {
      lines.push(`${kw.term},${kw.count},${kw.percentage}%`);
    }
  }

  // Keywords by Project section
  lines.push('');
  lines.push('KEYWORDS BY PROJECT');
  lines.push('Project,Keyword,Count');

  if (keywords.topKeywordsByProject) {
    for (const [project, projectKeywords] of Object.entries(keywords.topKeywordsByProject)) {
      if (Array.isArray(projectKeywords)) {
        for (const kw of projectKeywords) {
          const projectName = project.includes(',') ? `"${project}"` : project;
          lines.push(`${projectName},${kw.term},${kw.count}`);
        }
      }
    }
  }

  await writeFile(outputPath, lines.join('\n'), 'utf8');
  return outputPath;
}

/**
 * Export single table to CSV
 * @param {Array<Array>} data - 2D array of data (first row = headers)
 * @param {string} outputPath - Output file path
 * @returns {Promise<string>} Path to exported file
 */
export async function exportTableToCSV(data, outputPath) {
  const lines = data.map(row =>
    row.map(cell => {
      // Escape cells containing commas or quotes
      const cellStr = String(cell);
      if (cellStr.includes(',') || cellStr.includes('"')) {
        return `"${cellStr.replace(/"/g, '""')}"`;
      }
      return cellStr;
    }).join(',')
  );

  await writeFile(outputPath, lines.join('\n'), 'utf8');
  return outputPath;
}
