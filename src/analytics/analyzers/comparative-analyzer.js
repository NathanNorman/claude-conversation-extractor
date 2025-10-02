/**
 * Comparative Analyzer
 *
 * Provides week-over-week, month-over-month comparisons and trend analysis.
 * Helps users understand changes in their coding patterns over time.
 */

/**
 * Generate comparative analytics
 * @param {Object} cache - Analytics cache
 * @returns {Object} Comparative analysis
 */
export function generateComparativeAnalytics(cache) {
  if (!cache || !cache.timePatterns) {
    return createEmptyComparative();
  }

  const weekOverWeek = compareWeekOverWeek(cache.timePatterns);
  const monthOverMonth = compareMonthOverMonth(cache.timePatterns);
  const personalBests = findPersonalBests(cache);

  return {
    weekOverWeek,
    monthOverMonth,
    personalBests
  };
}

/**
 * Compare this week vs last week
 * @param {Object} timePatterns - Time patterns data
 * @returns {Object} Week-over-week comparison
 */
function compareWeekOverWeek(timePatterns) {
  if (!timePatterns.weeklyTrend || timePatterns.weeklyTrend.length < 2) {
    return null;
  }

  const trend = timePatterns.weeklyTrend;
  const thisWeek = trend[trend.length - 1];
  const lastWeek = trend[trend.length - 2];

  const change = thisWeek - lastWeek;
  const changePercent = lastWeek > 0 ? (change / lastWeek) * 100 : 0;

  return {
    thisWeek,
    lastWeek,
    change,
    changePercent: parseFloat(changePercent.toFixed(1)),
    trend: change > 0 ? 'increasing' : change < 0 ? 'decreasing' : 'stable'
  };
}

/**
 * Compare this month vs last month
 * @param {Object} timePatterns - Time patterns data
 * @returns {Object} Month-over-month comparison
 */
function compareMonthOverMonth(timePatterns) {
  if (!timePatterns.monthlyTrend || timePatterns.monthlyTrend.length < 2) {
    return null;
  }

  const trend = timePatterns.monthlyTrend;
  const thisMonth = trend[trend.length - 1];
  const lastMonth = trend[trend.length - 2];

  const change = thisMonth - lastMonth;
  const changePercent = lastMonth > 0 ? (change / lastMonth) * 100 : 0;

  return {
    thisMonth,
    lastMonth,
    change,
    changePercent: parseFloat(changePercent.toFixed(1)),
    trend: change > 0 ? 'increasing' : change < 0 ? 'decreasing' : 'stable'
  };
}

/**
 * Find personal best records
 * @param {Object} cache - Analytics cache
 * @returns {Object} Personal bests
 */
function findPersonalBests(cache) {
  const bests = {};

  // Most conversations in a week
  if (cache.timePatterns?.weeklyTrend) {
    const maxWeek = Math.max(...cache.timePatterns.weeklyTrend);
    bests.mostConversationsInWeek = maxWeek;
  }

  // Most conversations in a month
  if (cache.timePatterns?.monthlyTrend) {
    const maxMonth = Math.max(...cache.timePatterns.monthlyTrend);
    bests.mostConversationsInMonth = maxMonth;
  }

  // Longest conversation
  if (cache.conversationStats?.longestConversation) {
    bests.longestConversation = cache.conversationStats.longestConversation.messages;
  }

  // Longest streak
  if (cache.timePatterns?.streaks) {
    bests.longestStreak = cache.timePatterns.streaks.longest;
  }

  // Most tools in one conversation
  if (cache.toolUsage?.total && cache.overview?.totalConversations) {
    // This is an approximation - we'd need conversation-level tool counts for accuracy
    bests.avgToolsPerConversation = parseFloat((cache.toolUsage.total / cache.overview.totalConversations).toFixed(1));
  }

  return bests;
}

/**
 * Generate trend forecast (simple linear projection)
 * @param {Array<number>} data - Historical data points
 * @param {number} periods - Number of periods to forecast
 * @returns {Array<number>} Forecasted values
 */
export function generateForecast(data, periods = 4) {
  if (!data || data.length < 2) {
    return [];
  }

  // Simple linear regression for trend
  const validData = data.filter(v => v !== null && v !== undefined);

  if (validData.length < 2) {
    return [];
  }

  // Calculate slope using last N points
  const n = Math.min(6, validData.length);
  const recentData = validData.slice(-n);

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

  for (let i = 0; i < recentData.length; i++) {
    sumX += i;
    sumY += recentData[i];
    sumXY += i * recentData[i];
    sumX2 += i * i;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Generate forecast
  const forecast = [];
  const lastIndex = recentData.length - 1;

  for (let i = 1; i <= periods; i++) {
    const value = slope * (lastIndex + i) + intercept;
    forecast.push(Math.max(0, Math.round(value))); // No negative forecasts
  }

  return forecast;
}

/**
 * Create empty comparative structure
 */
function createEmptyComparative() {
  return {
    weekOverWeek: null,
    monthOverMonth: null,
    personalBests: {}
  };
}

/**
 * Update cache with comparative analytics
 * @param {Object} cache - Analytics cache
 * @param {Object} comparative - Comparative analysis
 */
export function updateCacheWithComparative(cache, comparative) {
  cache.comparative = comparative;
  return cache;
}
