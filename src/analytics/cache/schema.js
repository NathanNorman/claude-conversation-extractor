/**
 * Analytics Cache Schema Definition
 *
 * This file defines the structure of the analytics cache used to store
 * precomputed metrics and insights about conversation history.
 */

/**
 * Current cache version
 * v3: Added turn-based message counting (userTurns, assistantTurns, totalTurns)
 */
export const CACHE_VERSION = 3;

/**
 * Creates an empty analytics cache with default values
 * @returns {Object} Empty analytics cache object
 */
export function createEmptyCache() {
  return {
    version: CACHE_VERSION,
    lastUpdated: new Date().toISOString(),
    lastAnalyzedTimestamp: null,

    overview: {
      totalConversations: 0,
      totalMessages: 0, // Legacy: JSONL entries
      totalUserTurns: 0, // NEW v3: Actual user "enter" presses
      totalAssistantTurns: 0, // NEW v3: Actual assistant responses
      totalTurns: 0, // NEW v3: Total conversational exchanges
      totalToolInvocations: 0,
      dateRange: {
        first: null,
        last: null,
        spanDays: 0
      }
    },

    conversationStats: {
      avgMessagesPerConversation: 0, // Legacy
      avgTurnsPerConversation: 0, // NEW v3
      avgUserTurnsPerConversation: 0, // NEW v3
      avgAssistantTurnsPerConversation: 0, // NEW v3
      medianMessagesPerConversation: 0, // Legacy
      medianTurnsPerConversation: 0, // NEW v3
      avgDurationMinutes: 0,
      longestConversation: null,
      byProject: {}
    },

    timePatterns: {
      hourlyActivity: Array(24).fill(0),
      dailyActivity: Array(7).fill(0),
      weeklyTrend: [],
      monthlyTrend: [],
      streaks: {
        current: 0,
        longest: 0,
        longestPeriod: null
      },
      busiestHour: null,
      busiestDay: null,
      totalActiveDays: 0
    },

    toolUsage: {
      total: 0,
      byTool: {},
      byProject: {},
      combinations: [],
      topSequences: []
    },

    contentAnalysis: {
      totalCodeBlocks: 0,
      languages: {},
      frameworks: {},
      avgMessageLength: {
        user: 0,
        assistant: 0
      },
      codeToTextRatio: 0,
      mostEditedFiles: []
    },

    searchPatterns: {
      avgSearchTime: 0,
      totalSearches: 0,
      topKeywords: [],
      noResultsCount: 0,
      avgResultsPerSearch: 0,
      searchFrequency: {
        daily: 0,
        weekly: 0
      }
    },

    milestones: {
      badges: [],
      achievements: {
        totalWords: 0,
        totalCodeLines: 0,
        projectsWorked: 0,
        toolsMastered: []
      }
    },

    productivityMetrics: {
      conversationsPerWeek: 0,
      messagesPerDay: 0,
      toolsPerConversation: 0,
      deepWorkSessions: 0,
      quickQuestions: 0,
      weekendActivity: 0
    },

    userActions: {
      slashCommands: {
        total: 0,
        byCommand: {},
        topCommands: []
      },
      hooks: {
        total: 0,
        byHook: {},
        topHooks: []
      }
    },

    keywords: {
      summary: {
        totalConversations: 0,
        conversationsWithKeywords: 0,
        uniqueKeywords: 0,
        coveragePercentage: 0
      },
      topKeywords: [],
      topKeywordsByProject: {},
      topKeywordPairs: [],
      trends: [],
      rareKeywords: []
    }
  };
}

/**
 * Validates a cache object against the schema
 * @param {Object} cache - Cache object to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateCache(cache) {
  const errors = [];

  if (!cache || typeof cache !== 'object') {
    return { valid: false, errors: ['Cache must be an object'] };
  }

  // Version check
  if (cache.version !== CACHE_VERSION) {
    errors.push(`Cache version mismatch: expected ${CACHE_VERSION}, got ${cache.version}`);
  }

  // Required top-level fields
  const requiredFields = ['version', 'lastUpdated', 'overview', 'conversationStats'];
  for (const field of requiredFields) {
    if (!(field in cache)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate overview structure
  if (cache.overview) {
    if (typeof cache.overview.totalConversations !== 'number') {
      errors.push('overview.totalConversations must be a number');
    }
    if (typeof cache.overview.totalMessages !== 'number') {
      errors.push('overview.totalMessages must be a number');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Migrates an old cache to the current schema version
 * @param {Object} oldCache - Old cache object
 * @returns {Object} Migrated cache object
 */
export function migrateCache(oldCache) {
  if (!oldCache || oldCache.version === CACHE_VERSION) {
    return oldCache;
  }

  // Create new cache and copy over what we can
  const newCache = createEmptyCache();

  // Migrate from version 1 to version 2
  if (oldCache.version === 1) {
    // Copy over compatible fields
    if (oldCache.overview) {
      newCache.overview = { ...newCache.overview, ...oldCache.overview };
    }
    if (oldCache.conversationStats) {
      newCache.conversationStats = { ...newCache.conversationStats, ...oldCache.conversationStats };
    }
  }

  // Migrate from version 2 to version 3
  if (oldCache.version === 2) {
    // Copy over all compatible fields from v2
    if (oldCache.overview) {
      newCache.overview = { ...newCache.overview, ...oldCache.overview };
      // New fields (totalUserTurns, totalAssistantTurns, totalTurns) will use defaults from createEmptyCache
    }
    if (oldCache.conversationStats) {
      newCache.conversationStats = { ...newCache.conversationStats, ...oldCache.conversationStats };
      // New fields (avgTurnsPerConversation, etc.) will use defaults from createEmptyCache
    }
    if (oldCache.timePatterns) {
      newCache.timePatterns = oldCache.timePatterns;
    }
    if (oldCache.toolUsage) {
      newCache.toolUsage = oldCache.toolUsage;
    }
    if (oldCache.contentAnalysis) {
      newCache.contentAnalysis = oldCache.contentAnalysis;
    }
    if (oldCache.productivityMetrics) {
      newCache.productivityMetrics = oldCache.productivityMetrics;
    }
    if (oldCache.milestones) {
      newCache.milestones = oldCache.milestones;
    }
    if (oldCache.userActions) {
      newCache.userActions = oldCache.userActions;
    }
    if (oldCache.keywords) {
      newCache.keywords = oldCache.keywords;
    }
    // Note: Cache will be marked as needing rebuild since turn counts are 0
  }

  return newCache;
}
