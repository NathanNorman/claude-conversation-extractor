/**
 * Date Range Helper Utilities
 *
 * Provides date range calculation and filtering functions for analytics.
 * All date calculations use the user's local timezone for "start of day"
 * calculations, then convert to UTC for storage.
 */

/**
 * Standard date range preset options
 * @constant {Object}
 */
export const DATE_RANGE_PRESETS = {
  LAST_7_DAYS: 'Last 7 Days',
  LAST_30_DAYS: 'Last 30 Days',
  LAST_3_MONTHS: 'Last 3 Months',
  LAST_6_MONTHS: 'Last 6 Months',
  LAST_YEAR: 'Last Year',
  ALL_TIME: 'All Time'
};

/**
 * Date range specification object
 * @typedef {Object} DateRangeSpec
 * @property {string} label - Human-readable label (e.g., "Last 30 Days")
 * @property {Date|null} start - Start date in UTC (null for All Time)
 * @property {Date|null} end - End date in UTC (null for All Time)
 * @property {boolean} isFiltered - Whether this represents a filtered range
 */

/**
 * Calculate date range boundaries based on period label
 *
 * Uses local timezone for "start of today" calculations, then converts to UTC.
 * "Last N Days" means the last N complete days, not including partial today.
 *
 * @param {string} period - Period label from DATE_RANGE_PRESETS
 * @returns {DateRangeSpec} Date range specification
 *
 * @example
 * const range = calculateDateRange('Last 30 Days');
 * // {label: 'Last 30 Days', start: Date(...), end: Date(...), isFiltered: true}
 *
 * const allTime = calculateDateRange('All Time');
 * // {label: 'All Time', start: null, end: null, isFiltered: false}
 */
export function calculateDateRange(period) {
  if (period === DATE_RANGE_PRESETS.ALL_TIME) {
    return {
      label: period,
      start: null,
      end: null,
      isFiltered: false
    };
  }

  // Get start of today in local timezone
  const endDate = new Date();
  endDate.setHours(0, 0, 0, 0);

  // Calculate days based on period
  const daysMap = {
    [DATE_RANGE_PRESETS.LAST_7_DAYS]: 7,
    [DATE_RANGE_PRESETS.LAST_30_DAYS]: 30,
    [DATE_RANGE_PRESETS.LAST_3_MONTHS]: 90,
    [DATE_RANGE_PRESETS.LAST_6_MONTHS]: 180,
    [DATE_RANGE_PRESETS.LAST_YEAR]: 365
  };

  const days = daysMap[period];
  if (!days) {
    throw new Error(`Unknown date range period: ${period}`);
  }

  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days);

  return {
    label: period,
    start: startDate,
    end: endDate,
    isFiltered: true
  };
}

/**
 * Check if a conversation falls within a date range
 *
 * Uses the conversation's lastTimestamp to determine if it was active during
 * the specified period. This answers "What was I working on during this time?"
 *
 * @param {Object} conversation - Conversation object with timestamps
 * @param {string} conversation.firstTimestamp - ISO 8601 timestamp
 * @param {string} conversation.lastTimestamp - ISO 8601 timestamp
 * @param {DateRangeSpec} dateRange - Date range specification
 * @returns {boolean} True if conversation's last activity falls within range
 *
 * @example
 * const conversation = {
 *   firstTimestamp: '2025-10-01T10:00:00Z',
 *   lastTimestamp: '2025-10-15T14:30:00Z'
 * };
 * const range = calculateDateRange('Last 30 Days');
 * const inRange = isConversationInRange(conversation, range);
 */
export function isConversationInRange(conversation, dateRange) {
  // All Time includes everything
  if (!dateRange.isFiltered) {
    return true;
  }

  // Require valid timestamps
  if (!conversation.lastTimestamp) {
    return false;
  }

  try {
    const lastActivity = new Date(conversation.lastTimestamp);

    // Check if date is valid
    if (isNaN(lastActivity.getTime())) {
      return false;
    }

    // Check if last activity falls within range
    if (dateRange.start && lastActivity < dateRange.start) {
      return false;
    }
    if (dateRange.end && lastActivity >= dateRange.end) {
      return false;
    }

    return true;
  } catch (error) {
    // Invalid timestamp format
    return false;
  }
}

/**
 * Format a date range as a human-readable label
 *
 * @param {Date|null} start - Start date (null for All Time)
 * @param {Date|null} end - End date (null for All Time)
 * @returns {string} Formatted date range label
 *
 * @example
 * formatDateRangeLabel(null, null) // "All Time"
 * formatDateRangeLabel(new Date('2025-10-01'), new Date('2025-10-07'))
 * // "Oct 1-7, 2025"
 * formatDateRangeLabel(new Date('2025-09-22'), new Date('2025-10-22'))
 * // "Sep 22 - Oct 22, 2025"
 */
export function formatDateRangeLabel(start, end) {
  if (!start && !end) {
    return 'All Time';
  }

  if (!start || !end) {
    return 'Invalid Range';
  }

  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  const startMonth = monthNames[start.getMonth()];
  const startDay = start.getDate();
  const startYear = start.getFullYear();

  const endMonth = monthNames[end.getMonth()];
  const endDay = end.getDate();
  const endYear = end.getFullYear();

  const currentYear = new Date().getFullYear();

  // Same month, same year
  if (start.getMonth() === end.getMonth() && startYear === endYear) {
    if (startYear === currentYear) {
      return `${startMonth} ${startDay}-${endDay}, ${startYear}`;
    }
    return `${startMonth} ${startDay}-${endDay}, ${startYear}`;
  }

  // Different months
  if (startYear === currentYear && endYear === currentYear) {
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${endYear}`;
  }

  // Include years if not current year
  return `${startMonth} ${startDay}, ${startYear} - ${endMonth} ${endDay}, ${endYear}`;
}

/**
 * Get date range choices formatted for inquirer menu
 *
 * @returns {Array<{name: string, value: string}>} Menu choices
 *
 * @example
 * const choices = getDateRangeChoices();
 * // [
 * //   { name: 'Last 7 Days', value: 'Last 7 Days' },
 * //   { name: 'Last 30 Days', value: 'Last 30 Days' },
 * //   ...
 * // ]
 */
export function getDateRangeChoices() {
  return [
    { name: 'Last 7 Days', value: DATE_RANGE_PRESETS.LAST_7_DAYS },
    { name: 'Last 30 Days', value: DATE_RANGE_PRESETS.LAST_30_DAYS },
    { name: 'Last 3 Months', value: DATE_RANGE_PRESETS.LAST_3_MONTHS },
    { name: 'Last 6 Months', value: DATE_RANGE_PRESETS.LAST_6_MONTHS },
    { name: 'Last Year', value: DATE_RANGE_PRESETS.LAST_YEAR },
    { name: 'All Time (default)', value: DATE_RANGE_PRESETS.ALL_TIME }
  ];
}
