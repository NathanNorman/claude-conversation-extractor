import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import weekOfYear from 'dayjs/plugin/weekOfYear.js';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter.js';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore.js';

// Extend dayjs with plugins
dayjs.extend(customParseFormat);
dayjs.extend(relativeTime);
dayjs.extend(weekOfYear);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

/**
 * Predefined date ranges for filtering
 */
export const DATE_RANGES = {
  TODAY: 'today',
  YESTERDAY: 'yesterday',
  LAST_24_HOURS: 'last24hours',
  LAST_3_DAYS: 'last3days',
  LAST_WEEK: 'lastweek',
  LAST_2_WEEKS: 'last2weeks',
  LAST_MONTH: 'lastmonth',
  LAST_3_MONTHS: 'last3months',
  LAST_6_MONTHS: 'last6months',
  THIS_WEEK: 'thisweek',
  THIS_MONTH: 'thismonth',
  THIS_YEAR: 'thisyear',
  CUSTOM: 'custom'
};

/**
 * Get the start and end dates for a predefined date range
 * @param {string} rangeType - One of the DATE_RANGES constants
 * @param {Object} customRange - Custom date range {from: Date, to: Date}
 * @returns {{from: Date, to: Date}} Date range object
 */
export function getDateRange(rangeType, customRange = null) {
  const now = dayjs();
  const startOfDay = (date) => date.startOf('day');
  const endOfDay = (date) => date.endOf('day');
  
  switch (rangeType) {
  case DATE_RANGES.TODAY:
    return {
      from: startOfDay(now).toDate(),
      to: endOfDay(now).toDate()
    };
    
  case DATE_RANGES.YESTERDAY:
    return {
      from: startOfDay(now.subtract(1, 'day')).toDate(),
      to: endOfDay(now.subtract(1, 'day')).toDate()
    };
    
  case DATE_RANGES.LAST_24_HOURS:
    return {
      from: now.subtract(24, 'hours').toDate(),
      to: now.toDate()
    };
    
  case DATE_RANGES.LAST_3_DAYS:
    return {
      from: startOfDay(now.subtract(3, 'days')).toDate(),
      to: endOfDay(now).toDate()
    };
    
  case DATE_RANGES.LAST_WEEK:
    return {
      from: startOfDay(now.subtract(7, 'days')).toDate(),
      to: endOfDay(now).toDate()
    };
    
  case DATE_RANGES.LAST_2_WEEKS:
    return {
      from: startOfDay(now.subtract(14, 'days')).toDate(),
      to: endOfDay(now).toDate()
    };
    
  case DATE_RANGES.LAST_MONTH:
    return {
      from: startOfDay(now.subtract(30, 'days')).toDate(),
      to: endOfDay(now).toDate()
    };
    
  case DATE_RANGES.LAST_3_MONTHS:
    return {
      from: startOfDay(now.subtract(90, 'days')).toDate(),
      to: endOfDay(now).toDate()
    };
    
  case DATE_RANGES.LAST_6_MONTHS:
    return {
      from: startOfDay(now.subtract(180, 'days')).toDate(),
      to: endOfDay(now).toDate()
    };
    
  case DATE_RANGES.THIS_WEEK:
    // Monday to now
    return {
      from: startOfDay(now.startOf('week').add(1, 'day')).toDate(), // Monday
      to: endOfDay(now).toDate()
    };
    
  case DATE_RANGES.THIS_MONTH:
    return {
      from: startOfDay(now.startOf('month')).toDate(),
      to: endOfDay(now).toDate()
    };
    
  case DATE_RANGES.THIS_YEAR:
    return {
      from: startOfDay(now.startOf('year')).toDate(),
      to: endOfDay(now).toDate()
    };
    
  case DATE_RANGES.CUSTOM:
    if (!customRange || !customRange.from || !customRange.to) {
      throw new Error('Custom range requires from and to dates');
    }
    return {
      from: startOfDay(dayjs(customRange.from)).toDate(),
      to: endOfDay(dayjs(customRange.to)).toDate()
    };
    
  default:
    return null;
  }
}

/**
 * Check if a date falls within a date range
 * @param {Date} date - The date to check
 * @param {{from: Date, to: Date}} range - The date range
 * @returns {boolean} True if the date is within the range
 */
export function isDateInRange(date, range) {
  if (!date || !range || !range.from || !range.to) {
    return true; // No filter applied
  }
  
  const target = dayjs(date);
  const from = dayjs(range.from);
  const to = dayjs(range.to);
  
  return target.isSameOrAfter(from) && target.isSameOrBefore(to);
}

/**
 * Get date range display labels for UI
 */
export const DATE_RANGE_LABELS = {
  [DATE_RANGES.TODAY]: '📅 Today',
  [DATE_RANGES.YESTERDAY]: '📅 Yesterday',
  [DATE_RANGES.LAST_24_HOURS]: '⏰ Last 24 hours',
  [DATE_RANGES.LAST_3_DAYS]: '📆 Last 3 days',
  [DATE_RANGES.LAST_WEEK]: '📆 Last week (7 days)',
  [DATE_RANGES.LAST_2_WEEKS]: '📆 Last 2 weeks',
  [DATE_RANGES.LAST_MONTH]: '📆 Last month (30 days)',
  [DATE_RANGES.LAST_3_MONTHS]: '📆 Last 3 months',
  [DATE_RANGES.LAST_6_MONTHS]: '📆 Last 6 months',
  [DATE_RANGES.THIS_WEEK]: '📅 This week (Mon-today)',
  [DATE_RANGES.THIS_MONTH]: '📅 This month',
  [DATE_RANGES.THIS_YEAR]: '📅 This year',
  [DATE_RANGES.CUSTOM]: '📝 Custom date range...'
};

/**
 * Format a date range for display
 * @param {string} rangeType - The type of date range
 * @param {{from: Date, to: Date}} customRange - Custom range if applicable
 * @returns {string} Formatted date range string
 */
export function formatDateRange(rangeType, customRange = null) {
  if (!rangeType) return '';
  
  if (rangeType === DATE_RANGES.CUSTOM && customRange) {
    const from = dayjs(customRange.from).format('MMM D, YYYY');
    const to = dayjs(customRange.to).format('MMM D, YYYY');
    return `${from} - ${to}`;
  }
  
  // Get the actual date range
  const range = getDateRange(rangeType, customRange);
  if (!range) return '';
  
  // For predefined ranges, use the label
  if (DATE_RANGE_LABELS[rangeType]) {
    // Remove emoji and space from the beginning
    const label = DATE_RANGE_LABELS[rangeType].replace(/^[\u{1F4C5}\u{1F4C6}\u{23F0}\u{1F4DD}] /u, '');
    return label;
  }
  
  return '';
}

/**
 * Get relative time string from date
 * @param {Date} date - The date to format
 * @returns {string} Relative time string like "2 days ago"
 */
export function getRelativeTime(date) {
  return dayjs(date).fromNow();
}

/**
 * Format date for display in search results
 * @param {Date} date - The date to format
 * @param {boolean} includeTime - Whether to include time
 * @returns {string} Formatted date string
 */
export function formatDate(date, includeTime = true) {
  const d = dayjs(date);
  const now = dayjs();
  
  // If today, show "Today" + time
  if (d.isSame(now, 'day')) {
    return includeTime ? `Today ${d.format('h:mm A')}` : 'Today';
  }
  
  // If yesterday, show "Yesterday" + time
  if (d.isSame(now.subtract(1, 'day'), 'day')) {
    return includeTime ? `Yesterday ${d.format('h:mm A')}` : 'Yesterday';
  }
  
  // If within this week, show day name + time
  if (d.isAfter(now.startOf('week'))) {
    return includeTime ? d.format('ddd h:mm A') : d.format('ddd');
  }
  
  // If within this year, show month and day
  if (d.isSame(now, 'year')) {
    return includeTime ? d.format('MMM D h:mm A') : d.format('MMM D');
  }
  
  // Otherwise show full date
  return includeTime ? d.format('MMM D, YYYY h:mm A') : d.format('MMM D, YYYY');
}

/**
 * Parse custom date input from user
 * @param {string} input - User's date input
 * @returns {Date|null} Parsed date or null if invalid
 */
export function parseCustomDate(input) {
  if (!input) return null;
  
  // Try common date formats
  const formats = [
    'YYYY-MM-DD',
    'MM/DD/YYYY',
    'MM-DD-YYYY',
    'DD/MM/YYYY',
    'DD-MM-YYYY',
    'MMM DD, YYYY',
    'MMMM DD, YYYY',
    'MM/DD/YY',
    'M/D/YY',
    'M/D/YYYY'
  ];
  
  for (const format of formats) {
    const parsed = dayjs(input, format, true);
    if (parsed.isValid()) {
      return parsed.toDate();
    }
  }
  
  // Try native Date parsing as fallback
  const nativeDate = new Date(input);
  if (!isNaN(nativeDate.getTime())) {
    return nativeDate;
  }
  
  return null;
}

/**
 * Get quick date shortcuts for custom date input
 * @returns {Array} Array of shortcut options
 */
export function getDateShortcuts() {
  const now = dayjs();
  
  return [
    { name: 'Start of this year', value: now.startOf('year').format('YYYY-MM-DD') },
    { name: 'Start of last month', value: now.subtract(1, 'month').startOf('month').format('YYYY-MM-DD') },
    { name: '30 days ago', value: now.subtract(30, 'days').format('YYYY-MM-DD') },
    { name: '60 days ago', value: now.subtract(60, 'days').format('YYYY-MM-DD') },
    { name: '90 days ago', value: now.subtract(90, 'days').format('YYYY-MM-DD') },
    { name: '6 months ago', value: now.subtract(6, 'months').format('YYYY-MM-DD') },
    { name: '1 year ago', value: now.subtract(1, 'year').format('YYYY-MM-DD') }
  ];
}