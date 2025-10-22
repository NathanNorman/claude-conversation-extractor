/**
 * Conversation Analyzer
 *
 * Parses JSONL conversation files and extracts basic metrics.
 * Uses streaming to handle large files efficiently.
 */

import { createReadStream } from 'fs';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { createInterface } from 'readline';

/**
 * Discover all JSONL conversation files
 * @param {string} projectsDir - Path to projects directory
 * @returns {Promise<Array<Object>>} Array of conversation file info
 */
export async function discoverConversations(projectsDir) {
  const conversations = [];

  try {
    const projects = await readdir(projectsDir);

    for (const project of projects) {
      const projectPath = join(projectsDir, project);
      const projectStat = await stat(projectPath).catch(() => null);

      if (!projectStat?.isDirectory()) {
        continue;
      }

      // Check for conversations/ subdirectory (old structure)
      const conversationsPath = join(projectPath, 'conversations');
      const hasConversationsDir = await stat(conversationsPath).then(() => true).catch(() => false);

      // Determine which directory to scan
      const scanPath = hasConversationsDir ? conversationsPath : projectPath;
      const files = await readdir(scanPath);

      for (const file of files) {
        if (!file.endsWith('.jsonl')) {
          continue;
        }

        const filePath = join(scanPath, file);
        const fileStat = await stat(filePath);

        conversations.push({
          project,
          fileName: file,
          filePath,
          mtime: fileStat.mtime,
          size: fileStat.size
        });
      }
    }
  } catch (error) {
    throw new Error(`Failed to discover conversations: ${error.message}`);
  }

  return conversations;
}

/**
 * Parse a JSONL conversation file
 * @param {string} filePath - Path to JSONL file
 * @returns {Promise<Object>} Conversation data
 */
export async function parseConversation(filePath) {
  const messages = [];
  const toolInvocations = [];
  let firstTimestamp = null;
  let lastTimestamp = null;

  // Track conversational turns
  let userTurns = 0; // Actual user "enter" presses (text + image)
  let assistantTurns = 0; // Actual assistant responses (grouped consecutive entries)
  let inAssistantTurn = false; // Track if we're in a consecutive assistant group
  let previousType = null; // Track type transitions

  try {
    const fileStream = createReadStream(filePath);
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (!line.trim()) {
        continue;
      }

      try {
        const entry = JSON.parse(line);

        // Track timestamps
        if (entry.timestamp) {
          const ts = new Date(entry.timestamp);
          if (!firstTimestamp || ts < firstTimestamp) {
            firstTimestamp = ts;
          }
          if (!lastTimestamp || ts > lastTimestamp) {
            lastTimestamp = ts;
          }
        }

        // Collect message info (keep for backward compatibility)
        if (entry.message) {
          messages.push({
            role: entry.message.role,
            timestamp: entry.timestamp,
            content: entry.message.content
          });
        }

        // Count actual conversational turns
        const entryType = entry.type;
        if (entryType === 'user' && entry.message && entry.message.content && entry.message.content.length > 0) {
          const contentType = entry.message.content[0].type;
          // Count only text and image messages (exclude tool_result - those are automatic)
          if (contentType === 'text' || contentType === 'image') {
            userTurns++;
          }

          // End any previous assistant turn
          if (inAssistantTurn) {
            inAssistantTurn = false;
          }
        } else if (entryType === 'assistant' && entry.message) {
          // Start a new assistant turn if not already in one
          if (!inAssistantTurn) {
            assistantTurns++;
            inAssistantTurn = true;
          }
          // Otherwise, we're continuing the same assistant turn (consecutive entries)
        }

        previousType = entryType;

        // Track tool invocations
        if (entry.type === 'tool_use' || entry.type === 'tool_result') {
          toolInvocations.push({
            type: entry.type,
            toolName: entry.name || entry.toolName,
            timestamp: entry.timestamp
          });
        }
      } catch (parseError) {
        // Skip malformed lines
        continue;
      }
    }
  } catch (error) {
    throw new Error(`Failed to parse conversation ${filePath}: ${error.message}`);
  }

  // Calculate duration
  let durationMs = 0;
  if (firstTimestamp && lastTimestamp) {
    durationMs = lastTimestamp - firstTimestamp;
  }

  return {
    messages,
    toolInvocations,
    firstTimestamp: firstTimestamp?.toISOString() || null,
    lastTimestamp: lastTimestamp?.toISOString() || null,
    durationMs,
    messageCount: messages.length, // Legacy: JSONL entries with .message field
    userTurns, // NEW: Actual user "enter" presses
    assistantTurns, // NEW: Actual assistant responses (grouped)
    totalTurns: userTurns + assistantTurns, // NEW: Total conversational exchanges
    toolCount: toolInvocations.length
  };
}

/**
 * Analyze all conversations and compute basic metrics
 * @param {string} projectsDir - Path to projects directory
 * @param {string} sinceTimestamp - Optional: only analyze conversations after this time
 * @returns {Promise<Object>} Analysis results
 */
export async function analyzeAllConversations(projectsDir, sinceTimestamp = null) {
  const conversations = await discoverConversations(projectsDir);

  // Filter by timestamp if provided
  let conversationsToAnalyze = conversations;
  if (sinceTimestamp) {
    const since = new Date(sinceTimestamp);
    conversationsToAnalyze = conversations.filter(c => c.mtime > since);
  }

  // Parse all conversations
  const results = {
    totalConversations: conversations.length,
    analyzedConversations: conversationsToAnalyze.length,
    totalMessages: 0, // Legacy: JSONL entries
    totalUserTurns: 0, // NEW: Actual user messages
    totalAssistantTurns: 0, // NEW: Actual assistant responses
    totalTurns: 0, // NEW: Total conversational exchanges
    totalToolInvocations: 0,
    conversations: [],
    byProject: {},
    timestamps: []
  };

  for (const conv of conversationsToAnalyze) {
    try {
      const data = await parseConversation(conv.filePath);

      const conversationInfo = {
        project: conv.project,
        fileName: conv.fileName,
        filePath: conv.filePath, // Include for tool/content analysis
        messageCount: data.messageCount, // Legacy
        userTurns: data.userTurns, // NEW
        assistantTurns: data.assistantTurns, // NEW
        totalTurns: data.totalTurns, // NEW
        toolCount: data.toolCount,
        durationMs: data.durationMs,
        firstTimestamp: data.firstTimestamp,
        lastTimestamp: data.lastTimestamp
      };

      results.conversations.push(conversationInfo);
      results.totalMessages += data.messageCount; // Legacy
      results.totalUserTurns += data.userTurns; // NEW
      results.totalAssistantTurns += data.assistantTurns; // NEW
      results.totalTurns += data.totalTurns; // NEW
      results.totalToolInvocations += data.toolCount;

      // Aggregate by project
      if (!results.byProject[conv.project]) {
        results.byProject[conv.project] = {
          count: 0,
          messages: 0, // Legacy
          userTurns: 0, // NEW
          assistantTurns: 0, // NEW
          totalTurns: 0, // NEW
          tools: 0
        };
      }
      results.byProject[conv.project].count += 1;
      results.byProject[conv.project].messages += data.messageCount; // Legacy
      results.byProject[conv.project].userTurns += data.userTurns; // NEW
      results.byProject[conv.project].assistantTurns += data.assistantTurns; // NEW
      results.byProject[conv.project].totalTurns += data.totalTurns; // NEW
      results.byProject[conv.project].tools += data.toolCount;

      // Track timestamps for date range
      if (data.firstTimestamp) {
        results.timestamps.push(data.firstTimestamp);
      }
      if (data.lastTimestamp) {
        results.timestamps.push(data.lastTimestamp);
      }
    } catch (error) {
      // Log error but continue processing other conversations
      console.warn(`Failed to analyze ${conv.filePath}:`, error.message);
    }
  }

  // Calculate date range
  if (results.timestamps.length > 0) {
    const sorted = results.timestamps.sort();
    results.dateRange = {
      first: sorted[0],
      last: sorted[sorted.length - 1],
      spanDays: calculateDaySpan(sorted[0], sorted[sorted.length - 1])
    };
  }

  // Calculate averages
  if (results.analyzedConversations > 0) {
    results.avgMessagesPerConversation = results.totalMessages / results.analyzedConversations; // Legacy
    results.avgTurnsPerConversation = results.totalTurns / results.analyzedConversations; // NEW
    results.avgUserTurnsPerConversation = results.totalUserTurns / results.analyzedConversations; // NEW
    results.avgAssistantTurnsPerConversation = results.totalAssistantTurns / results.analyzedConversations; // NEW
    results.avgToolsPerConversation = results.totalToolInvocations / results.analyzedConversations;
  }

  return results;
}

/**
 * Calculate number of days between two dates
 * @param {string} date1 - ISO date string
 * @param {string} date2 - ISO date string
 * @returns {number} Number of days
 */
function calculateDaySpan(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffMs = Math.abs(d2 - d1);
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Update cache with conversation analysis results
 * @param {Object} cache - Analytics cache object
 * @param {Object} analysis - Analysis results from analyzeAllConversations
 */
export async function updateCacheWithAnalysis(cache, analysis) {
  // Update overview
  cache.overview.totalConversations = analysis.totalConversations;
  cache.overview.totalMessages = analysis.totalMessages; // Legacy
  cache.overview.totalUserTurns = analysis.totalUserTurns; // NEW
  cache.overview.totalAssistantTurns = analysis.totalAssistantTurns; // NEW
  cache.overview.totalTurns = analysis.totalTurns; // NEW
  cache.overview.totalToolInvocations = analysis.totalToolInvocations;

  if (analysis.dateRange) {
    cache.overview.dateRange = analysis.dateRange;
  }

  // Update conversation stats
  cache.conversationStats.avgMessagesPerConversation = analysis.avgMessagesPerConversation || 0; // Legacy
  cache.conversationStats.avgTurnsPerConversation = analysis.avgTurnsPerConversation || 0; // NEW
  cache.conversationStats.avgUserTurnsPerConversation = analysis.avgUserTurnsPerConversation || 0; // NEW
  cache.conversationStats.avgAssistantTurnsPerConversation = analysis.avgAssistantTurnsPerConversation || 0; // NEW

  // Calculate median for turns (NEW)
  if (analysis.conversations.length > 0) {
    // Legacy: Keep message count median for compatibility
    const messageCounts = analysis.conversations
      .map(c => c.messageCount)
      .sort((a, b) => a - b);
    const midMsg = Math.floor(messageCounts.length / 2);
    cache.conversationStats.medianMessagesPerConversation = messageCounts.length % 2 === 0
      ? (messageCounts[midMsg - 1] + messageCounts[midMsg]) / 2
      : messageCounts[midMsg];

    // NEW: Calculate median for turns
    const turnCounts = analysis.conversations
      .map(c => c.totalTurns)
      .sort((a, b) => a - b);
    const midTurn = Math.floor(turnCounts.length / 2);
    cache.conversationStats.medianTurnsPerConversation = turnCounts.length % 2 === 0
      ? (turnCounts[midTurn - 1] + turnCounts[midTurn]) / 2
      : turnCounts[midTurn];
  }

  // Find longest conversation (by turns, not JSONL entries)
  if (analysis.conversations.length > 0) {
    const longest = analysis.conversations.reduce((max, conv) =>
      conv.totalTurns > (max?.totalTurns || 0) ? conv : max
    );
    cache.conversationStats.longestConversation = {
      project: longest.project,
      fileName: longest.fileName,
      messages: longest.messageCount, // Legacy
      turns: longest.totalTurns, // NEW
      userTurns: longest.userTurns, // NEW
      assistantTurns: longest.assistantTurns, // NEW
      duration: longest.durationMs
    };
  }

  // Update by-project stats
  cache.conversationStats.byProject = {};
  for (const [project, stats] of Object.entries(analysis.byProject)) {
    cache.conversationStats.byProject[project] = {
      count: stats.count,
      avgMessages: stats.messages / stats.count, // Legacy
      avgTurns: stats.totalTurns / stats.count, // NEW
      totalMessages: stats.messages, // Legacy
      totalTurns: stats.totalTurns, // NEW
      totalUserTurns: stats.userTurns, // NEW
      totalAssistantTurns: stats.assistantTurns // NEW
    };
  }

  // Analyze time patterns
  const { analyzeTimePatterns, updateCacheWithTimePatterns } = await import('./time-analyzer.js');
  const timePatterns = analyzeTimePatterns(analysis.conversations);
  updateCacheWithTimePatterns(cache, timePatterns);

  // Analyze tool usage
  // Note: Tool analysis requires re-parsing files for detailed tool info
  // For now, we'll use basic tool counts from the initial parse
  // Full tool analysis can be added later if needed
  const { analyzeToolsFromParsedData, updateCacheWithToolUsage } = await import('./tool-analyzer.js');
  try {
    const toolUsage = await analyzeToolsFromParsedData(analysis.conversations);
    updateCacheWithToolUsage(cache, toolUsage);
  } catch (error) {
    console.warn('Tool analysis failed, using empty data:', error.message);
    updateCacheWithToolUsage(cache, { total: 0, byTool: {}, byProject: {}, combinations: [], topSequences: [] });
  }

  // Analyze content (languages, frameworks)
  const { analyzeContent, updateCacheWithContentAnalysis } = await import('./content-analyzer.js');
  try {
    // Content analysis also needs full message data - we'll need to enhance data collection
    // For now, create a placeholder
    const contentAnalysis = analyzeContent(analysis.conversationsWithMessages || []);
    updateCacheWithContentAnalysis(cache, contentAnalysis);
  } catch (error) {
    console.warn('Content analysis failed, using empty data:', error.message);
    updateCacheWithContentAnalysis(cache, {
      totalCodeBlocks: 0,
      languages: {},
      frameworks: {},
      avgMessageLength: { user: 0, assistant: 0 },
      codeToTextRatio: 0,
      mostEditedFiles: []
    });
  }

  // Analyze productivity metrics
  const { analyzeProductivity, updateCacheWithProductivity } = await import('./productivity-analyzer.js');
  const productivityMetrics = analyzeProductivity(
    analysis.conversations,
    cache.timePatterns,
    cache.toolUsage
  );
  updateCacheWithProductivity(cache, productivityMetrics);

  // Analyze milestones and achievements
  const { analyzeMilestones, updateCacheWithMilestones } = await import('./milestone-analyzer.js');
  const milestones = analyzeMilestones(cache);
  updateCacheWithMilestones(cache, milestones);

  // Generate comparative analytics
  const { generateComparativeAnalytics, updateCacheWithComparative } = await import('./comparative-analyzer.js');
  const comparative = generateComparativeAnalytics(cache);
  updateCacheWithComparative(cache, comparative);

  // Analyze user actions (slash commands, hooks)
  const { analyzeUserActions, updateCacheWithUserActions } = await import('./user-action-analyzer.js');
  try {
    const userActions = await analyzeUserActions(analysis.conversations);
    updateCacheWithUserActions(cache, userActions);
  } catch (error) {
    console.warn('User action analysis failed:', error.message);
    updateCacheWithUserActions(cache, {
      slashCommands: { total: 0, byCommand: {}, topCommands: [] },
      hooks: { total: 0, byHook: {}, topHooks: [] }
    });
  }

  // Update timestamp
  cache.lastAnalyzedTimestamp = new Date().toISOString();

  return cache;
}
