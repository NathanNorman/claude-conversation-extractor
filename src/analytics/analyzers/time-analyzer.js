/**
 * Time Analyzer
 *
 * Analyzes temporal patterns in conversation activity.
 * Computes hourly, daily, weekly, and monthly trends.
 * Tracks streaks and identifies peak activity times.
 */

/**
 * Analyze time patterns from conversation data
 * @param {Array<Object>} conversations - Array of conversation objects with timestamps
 * @param {Object} dateRange - Optional date range filter
 * @returns {Object} Time pattern analysis
 */
export function analyzeTimePatterns(conversations, dateRange = null) {
  if (!conversations || conversations.length === 0) {
    return createEmptyTimePatterns();
  }

  // Extract all timestamps from conversations
  const timestamps = extractTimestamps(conversations);

  if (timestamps.length === 0) {
    return createEmptyTimePatterns();
  }

  // Compute various time-based metrics
  const hourlyActivity = computeHourlyActivity(timestamps);
  const dailyActivity = computeDailyActivity(timestamps);
  const dayHourMatrix = computeDayHourMatrix(timestamps); // Real day×hour data
  const weeklyTrend = computeWeeklyTrend(timestamps, dateRange);
  const monthlyTrend = computeMonthlyTrend(timestamps, dateRange);
  const streaks = computeStreaks(timestamps);
  const activeDays = countActiveDays(timestamps);

  // Find busiest times
  const busiestHour = findBusiestHour(hourlyActivity);
  const busiestDay = findBusiestDay(dailyActivity);

  return {
    hourlyActivity,
    dailyActivity,
    dayHourMatrix, // Add real day×hour matrix
    weeklyTrend,
    monthlyTrend,
    streaks,
    busiestHour,
    busiestDay,
    totalActiveDays: activeDays
  };
}

/**
 * Create empty time patterns structure
 * @returns {Object} Empty time patterns
 */
function createEmptyTimePatterns() {
  return {
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
  };
}

/**
 * Extract all timestamps from conversations
 * @param {Array<Object>} conversations - Conversations with firstTimestamp/lastTimestamp
 * @returns {Array<Date>} Array of Date objects
 */
function extractTimestamps(conversations) {
  const timestamps = [];

  for (const conv of conversations) {
    // Use both first and last timestamp for better coverage
    if (conv.firstTimestamp) {
      timestamps.push(new Date(conv.firstTimestamp));
    }
    if (conv.lastTimestamp && conv.lastTimestamp !== conv.firstTimestamp) {
      timestamps.push(new Date(conv.lastTimestamp));
    }
  }

  return timestamps.sort((a, b) => a - b);
}

/**
 * Compute hourly activity distribution (0-23)
 * @param {Array<Date>} timestamps - Array of timestamps
 * @returns {Array<number>} Activity count for each hour
 */
function computeHourlyActivity(timestamps) {
  const activity = Array(24).fill(0);

  for (const ts of timestamps) {
    const hour = ts.getHours();
    activity[hour]++;
  }

  return activity;
}

/**
 * Compute daily activity distribution (0=Sunday, 6=Saturday)
 * @param {Array<Date>} timestamps - Array of timestamps
 * @returns {Array<number>} Activity count for each day
 */
function computeDailyActivity(timestamps) {
  const activity = Array(7).fill(0);

  for (const ts of timestamps) {
    const day = ts.getDay();
    activity[day]++;
  }

  return activity;
}

/**
 * Compute real day×hour activity matrix
 * @param {Array<Date>} timestamps - Array of timestamps
 * @returns {Array<Array<number>>} 7×24 matrix (day × hour)
 */
function computeDayHourMatrix(timestamps) {
  // Initialize 7 days × 24 hours matrix
  const matrix = Array(7).fill(null).map(() => Array(24).fill(0));

  for (const ts of timestamps) {
    const day = ts.getDay(); // 0=Sunday, 6=Saturday
    const hour = ts.getHours(); // 0-23
    matrix[day][hour]++;
  }

  return matrix;
}

/**
 * Compute weekly trend for last 12 weeks
 * @param {Array<Date>} timestamps - Array of timestamps
 * @param {Object} dateRange - Optional date range filter
 * @returns {Array<number>} Activity count per week
 */
function computeWeeklyTrend(timestamps, dateRange = null) {
  // If filtered, compute trends relative to the filtered period
  // For "All Time", use last 12 weeks from now
  const endDate = dateRange?.end ? new Date(dateRange.end) : new Date();
  const weeklyData = [];

  // Go back 12 weeks
  for (let i = 11; i >= 0; i--) {
    const weekStart = new Date(endDate);
    weekStart.setDate(weekStart.getDate() - (i * 7) - endDate.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const count = timestamps.filter(ts => ts >= weekStart && ts < weekEnd).length;
    weeklyData.push(count);
  }

  return weeklyData;
}

/**
 * Compute monthly trend for last 12 months
 * @param {Array<Date>} timestamps - Array of timestamps
 * @param {Object} dateRange - Optional date range filter
 * @returns {Array<number>} Activity count per month
 */
function computeMonthlyTrend(timestamps, dateRange = null) {
  // If filtered, compute trends relative to the filtered period
  // For "All Time", use last 12 months from now
  const endDate = dateRange?.end ? new Date(dateRange.end) : new Date();
  const monthlyData = [];

  // Go back 12 months
  for (let i = 11; i >= 0; i--) {
    const monthStart = new Date(endDate.getFullYear(), endDate.getMonth() - i, 1);
    const monthEnd = new Date(endDate.getFullYear(), endDate.getMonth() - i + 1, 1);

    const count = timestamps.filter(ts => ts >= monthStart && ts < monthEnd).length;
    monthlyData.push(count);
  }

  return monthlyData;
}

/**
 * Compute activity streaks
 * @param {Array<Date>} timestamps - Array of timestamps
 * @returns {Object} Streak information
 */
function computeStreaks(timestamps) {
  if (timestamps.length === 0) {
    return {
      current: 0,
      longest: 0,
      longestPeriod: null
    };
  }

  // Get unique dates (YYYY-MM-DD)
  const uniqueDates = [...new Set(
    timestamps.map(ts => ts.toISOString().split('T')[0])
  )].sort();

  let currentStreak = 0;
  let longestStreak = 0;
  let longestStart = null;
  let longestEnd = null;
  let streakStart = null;
  let previousDate = null;

  const today = new Date().toISOString().split('T')[0];

  for (const dateStr of uniqueDates) {
    if (!previousDate) {
      // First date
      currentStreak = 1;
      streakStart = dateStr;
    } else {
      const daysDiff = getDaysDifference(previousDate, dateStr);

      if (daysDiff === 1) {
        // Consecutive day
        currentStreak++;
      } else {
        // Streak broken
        if (currentStreak > longestStreak) {
          longestStreak = currentStreak;
          longestStart = streakStart;
          longestEnd = previousDate;
        }
        currentStreak = 1;
        streakStart = dateStr;
      }
    }

    previousDate = dateStr;
  }

  // Check final streak
  if (currentStreak > longestStreak) {
    longestStreak = currentStreak;
    longestStart = streakStart;
    longestEnd = previousDate;
  }

  // Check if current streak is still active (last activity was today or yesterday)
  const lastActivityDate = uniqueDates[uniqueDates.length - 1];
  const daysSinceLastActivity = getDaysDifference(lastActivityDate, today);

  if (daysSinceLastActivity > 1) {
    currentStreak = 0; // Streak is broken
  }

  return {
    current: currentStreak,
    longest: longestStreak,
    longestPeriod: longestStart && longestEnd ? {
      start: longestStart,
      end: longestEnd
    } : null
  };
}

/**
 * Calculate day difference between two date strings
 * @param {string} date1 - ISO date string (YYYY-MM-DD)
 * @param {string} date2 - ISO date string (YYYY-MM-DD)
 * @returns {number} Number of days difference
 */
function getDaysDifference(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffMs = d2 - d1;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Count total number of unique active days
 * @param {Array<Date>} timestamps - Array of timestamps
 * @returns {number} Number of active days
 */
function countActiveDays(timestamps) {
  const uniqueDates = new Set(
    timestamps.map(ts => ts.toISOString().split('T')[0])
  );
  return uniqueDates.size;
}

/**
 * Find the busiest hour of the day
 * @param {Array<number>} hourlyActivity - Hourly activity array
 * @returns {number|null} Busiest hour (0-23) or null
 */
function findBusiestHour(hourlyActivity) {
  if (hourlyActivity.every(v => v === 0)) {
    return null;
  }

  const maxActivity = Math.max(...hourlyActivity);
  return hourlyActivity.indexOf(maxActivity);
}

/**
 * Find the busiest day of the week
 * @param {Array<number>} dailyActivity - Daily activity array
 * @returns {string|null} Day name or null
 */
function findBusiestDay(dailyActivity) {
  if (dailyActivity.every(v => v === 0)) {
    return null;
  }

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const maxActivity = Math.max(...dailyActivity);
  const busiestDayIndex = dailyActivity.indexOf(maxActivity);

  return dayNames[busiestDayIndex];
}

/**
 * Update cache with time pattern analysis
 * @param {Object} cache - Analytics cache
 * @param {Object} timePatterns - Time pattern analysis results
 */
export function updateCacheWithTimePatterns(cache, timePatterns) {
  cache.timePatterns = timePatterns;
  return cache;
}
