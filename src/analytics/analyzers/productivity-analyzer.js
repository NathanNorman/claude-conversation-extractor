/**
 * Productivity Analyzer
 *
 * Calculates productivity metrics and patterns.
 * Classifies conversations, tracks session lengths, and measures activity rates.
 */

/**
 * Analyze productivity patterns from conversations
 * @param {Array<Object>} conversations - Array of conversation objects
 * @param {Object} timePatterns - Time patterns from time-analyzer
 * @param {Object} toolUsage - Tool usage from tool-analyzer
 * @returns {Object} Productivity metrics
 */
export function analyzeProductivity(conversations, timePatterns, toolUsage) {
  if (!conversations || conversations.length === 0) {
    return createEmptyProductivityMetrics();
  }

  // Calculate time-based metrics
  const dateRange = calculateDateRange(conversations);
  const conversationsPerWeek = calculateConversationsPerWeek(conversations, dateRange);
  const messagesPerDay = calculateMessagesPerDay(conversations, dateRange);

  // Calculate tool metrics
  const totalTools = toolUsage?.total || 0;
  const totalConversations = conversations.length;
  const toolsPerConversation = totalConversations > 0 ? totalTools / totalConversations : 0;

  // Calculate session metrics
  const { avgSessionLength, deepWorkSessions, quickQuestions } = classifyConversations(conversations);

  // Calculate weekend activity
  const weekendActivity = calculateWeekendActivity(timePatterns);

  return {
    conversationsPerWeek,
    messagesPerDay,
    toolsPerConversation: parseFloat(toolsPerConversation.toFixed(1)),
    avgSessionLength: Math.round(avgSessionLength),
    deepWorkSessions,
    quickQuestions,
    weekendActivity: parseFloat(weekendActivity.toFixed(3))
  };
}

/**
 * Calculate date range from conversations
 * @param {Array<Object>} conversations - Conversations
 * @returns {Object} Date range info
 */
function calculateDateRange(conversations) {
  const timestamps = [];

  for (const conv of conversations) {
    if (conv.firstTimestamp) {
      timestamps.push(new Date(conv.firstTimestamp));
    }
    if (conv.lastTimestamp && conv.lastTimestamp !== conv.firstTimestamp) {
      timestamps.push(new Date(conv.lastTimestamp));
    }
  }

  if (timestamps.length === 0) {
    return { spanDays: 0, spanWeeks: 0 };
  }

  timestamps.sort((a, b) => a - b);
  const first = timestamps[0];
  const last = timestamps[timestamps.length - 1];
  const spanMs = last - first;
  const spanDays = Math.ceil(spanMs / (1000 * 60 * 60 * 24));
  const spanWeeks = spanDays / 7;

  return { spanDays, spanWeeks };
}

/**
 * Calculate conversations per week
 * @param {Array<Object>} conversations - Conversations
 * @param {Object} dateRange - Date range
 * @returns {number} Conversations per week
 */
function calculateConversationsPerWeek(conversations, dateRange) {
  if (dateRange.spanWeeks === 0) return 0;
  return parseFloat((conversations.length / dateRange.spanWeeks).toFixed(1));
}

/**
 * Calculate messages per day
 * @param {Array<Object>} conversations - Conversations
 * @param {Object} dateRange - Date range
 * @returns {number} Messages per day
 */
function calculateMessagesPerDay(conversations, dateRange) {
  if (dateRange.spanDays === 0) return 0;

  const totalMessages = conversations.reduce((sum, conv) => sum + (conv.messageCount || 0), 0);
  return parseFloat((totalMessages / dateRange.spanDays).toFixed(1));
}

/**
 * Classify conversations by duration and complexity
 * @param {Array<Object>} conversations - Conversations
 * @returns {Object} Classification results
 */
function classifyConversations(conversations) {
  let totalDuration = 0;
  let deepWorkSessions = 0;
  let quickQuestions = 0;

  // Thresholds
  const DEEP_WORK_THRESHOLD = 30 * 60 * 1000; // 30 minutes
  const QUICK_QUESTION_THRESHOLD = 5 * 60 * 1000; // 5 minutes

  for (const conv of conversations) {
    const duration = conv.durationMs || 0;
    totalDuration += duration;

    if (duration >= DEEP_WORK_THRESHOLD) {
      deepWorkSessions++;
    } else if (duration <= QUICK_QUESTION_THRESHOLD && duration > 0) {
      quickQuestions++;
    }
  }

  const avgSessionLength = conversations.length > 0
    ? totalDuration / conversations.length / 1000 // Convert to seconds
    : 0;

  return {
    avgSessionLength,
    deepWorkSessions,
    quickQuestions
  };
}

/**
 * Calculate weekend activity percentage
 * @param {Object} timePatterns - Time patterns
 * @returns {number} Weekend activity ratio (0-1)
 */
function calculateWeekendActivity(timePatterns) {
  if (!timePatterns || !timePatterns.dailyActivity) {
    return 0;
  }

  const dailyActivity = timePatterns.dailyActivity;
  const weekendActivity = dailyActivity[0] + dailyActivity[6]; // Sunday + Saturday
  const totalActivity = dailyActivity.reduce((sum, val) => sum + val, 0);

  return totalActivity > 0 ? weekendActivity / totalActivity : 0;
}

/**
 * Create empty productivity metrics
 * @returns {Object} Empty metrics
 */
function createEmptyProductivityMetrics() {
  return {
    conversationsPerWeek: 0,
    messagesPerDay: 0,
    toolsPerConversation: 0,
    avgSessionLength: 0,
    deepWorkSessions: 0,
    quickQuestions: 0,
    weekendActivity: 0
  };
}

/**
 * Update cache with productivity metrics
 * @param {Object} cache - Analytics cache
 * @param {Object} productivityMetrics - Productivity analysis results
 */
export function updateCacheWithProductivity(cache, productivityMetrics) {
  cache.productivityMetrics = productivityMetrics;
  return cache;
}
