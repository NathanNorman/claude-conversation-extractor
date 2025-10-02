/**
 * Heatmap Generator
 *
 * Creates GitHub-style activity heatmaps showing activity patterns
 * by hour and day of week.
 */

import chalk from 'chalk';
import { formatDayShort } from './formatters.js';

// Intensity blocks - now with 5 levels to distinguish zero from low
const INTENSITY_BLOCKS = ['·', '░', '▒', '▓', '█'];

// Color functions for different intensity levels
// GitHub-inspired green gradient - works beautifully on dark backgrounds
const INTENSITY_COLORS = [
  (s) => chalk.hex('#666666')(s),     // Zero - medium gray (visible)
  (s) => chalk.hex('#0E4429')(s),     // Low - dark green
  (s) => chalk.hex('#006D32')(s),     // Medium - medium green
  (s) => chalk.hex('#26A641')(s),     // High - bright green
  (s) => chalk.hex('#39D353').bold(s) // Very high - vibrant green
];

/**
 * Generate an activity heatmap (day x hour grid)
 * @param {Array<number>} hourlyActivity - Activity by hour (24 values)
 * @param {Array<number>} dailyActivity - Activity by day (7 values)
 * @param {Array<Array<number>>} dayHourMatrix - Optional real day×hour matrix
 * @returns {string} ASCII heatmap
 */
export function generateActivityHeatmap(hourlyActivity, dailyActivity, dayHourMatrix = null) {
  if (!hourlyActivity || !dailyActivity) {
    return 'No activity data available';
  }

  // Use real day×hour matrix if provided, otherwise approximate
  const activityMatrix = dayHourMatrix || createActivityMatrix(hourlyActivity, dailyActivity);

  // Build the heatmap
  const lines = [];

  // Header with hour labels
  const hourLabels = buildHourLabels();
  lines.push(hourLabels);

  // Each day row
  for (let day = 0; day < 7; day++) {
    const dayLabel = formatDayShort(day).padEnd(4);
    const rowBlocks = [];

    for (let hour = 0; hour < 24; hour++) {
      const activity = activityMatrix[day][hour];
      const intensity = getIntensityLevel(activity, activityMatrix);
      const block = INTENSITY_BLOCKS[intensity];
      const coloredBlock = INTENSITY_COLORS[intensity](block);
      rowBlocks.push(coloredBlock);
    }

    lines.push(`${dayLabel}${rowBlocks.join(' ')}`);
  }

  return lines.join('\n');
}

/**
 * Build hour labels for heatmap header
 * @returns {string} Hour labels line
 */
function buildHourLabels() {
  const labels = [];
  labels.push('    '); // Padding for day labels

  for (let hour = 0; hour < 24; hour++) {
    if (hour % 3 === 0) {
      labels.push(hour.toString().padStart(2, ' '));
    } else {
      labels.push('  ');
    }
  }

  return labels.join('');
}

/**
 * Create activity matrix from hourly and daily data
 * This is a simplified approximation - true day×hour would need raw data
 * @param {Array<number>} hourlyActivity - Total activity by hour
 * @param {Array<number>} dailyActivity - Total activity by day
 * @returns {Array<Array<number>>} 7x24 matrix
 */
function createActivityMatrix(hourlyActivity, dailyActivity) {
  const matrix = [];

  // Calculate total activity
  const totalActivity = dailyActivity.reduce((sum, val) => sum + val, 0);

  for (let day = 0; day < 7; day++) {
    const dayRow = [];
    const dayProportion = totalActivity > 0 ? dailyActivity[day] / totalActivity : 0;

    for (let hour = 0; hour < 24; hour++) {
      // Approximate activity for this day-hour combination
      // by combining hourly and daily proportions
      const hourProportion = hourlyActivity[hour] / (hourlyActivity.reduce((sum, val) => sum + val, 0) || 1);
      const activity = Math.round(totalActivity * dayProportion * hourProportion * 7 * 24);
      dayRow.push(activity);
    }

    matrix.push(dayRow);
  }

  return matrix;
}

/**
 * Get intensity level for a value relative to the matrix
 * @param {number} value - Activity value
 * @param {Array<Array<number>>} matrix - Activity matrix for context
 * @returns {number} Intensity level (0-4)
 */
function getIntensityLevel(value, matrix) {
  // Zero activity gets its own level
  if (value === 0) return 0;

  // Find max value in matrix
  const maxValue = Math.max(...matrix.flat());

  if (maxValue === 0) return 0;

  const normalized = value / maxValue;

  // 5 levels: 0=zero, 1=low, 2=medium, 3=high, 4=very high
  if (normalized <= 0.2) return 1;   // 1-20% = low
  if (normalized <= 0.5) return 2;   // 20-50% = medium
  if (normalized <= 0.75) return 3;  // 50-75% = high
  return 4;                          // 75-100% = very high
}

/**
 * Generate a simple hourly distribution chart
 * @param {Array<number>} hourlyActivity - Activity by hour
 * @returns {string} Hourly distribution chart
 */
export function generateHourlyChart(hourlyActivity) {
  if (!hourlyActivity || hourlyActivity.length !== 24) {
    return 'No hourly data available';
  }

  const lines = [];
  const maxActivity = Math.max(...hourlyActivity);

  if (maxActivity === 0) {
    return 'No activity recorded';
  }

  // Scale for visualization
  const barWidth = 20;

  for (let hour = 0; hour < 24; hour++) {
    const activity = hourlyActivity[hour];
    const barLength = Math.round((activity / maxActivity) * barWidth);
    const bar = '█'.repeat(barLength);
    const hourLabel = hour.toString().padStart(2, '0');

    lines.push(`${hourLabel}:00 ${bar} ${activity}`);
  }

  return lines.join('\n');
}

/**
 * Generate a simple daily distribution chart
 * @param {Array<number>} dailyActivity - Activity by day
 * @returns {string} Daily distribution chart
 */
export function generateDailyChart(dailyActivity) {
  if (!dailyActivity || dailyActivity.length !== 7) {
    return 'No daily data available';
  }

  const lines = [];
  const maxActivity = Math.max(...dailyActivity);

  if (maxActivity === 0) {
    return 'No activity recorded';
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const barWidth = 20;

  for (let day = 0; day < 7; day++) {
    const activity = dailyActivity[day];
    const barLength = Math.round((activity / maxActivity) * barWidth);
    const bar = '█'.repeat(barLength);
    const dayLabel = dayNames[day];

    lines.push(`${dayLabel} ${bar} ${activity}`);
  }

  return lines.join('\n');
}

/**
 * Generate a compact activity summary
 * @param {Array<number>} hourlyActivity - Activity by hour
 * @param {Array<number>} dailyActivity - Activity by day
 * @returns {Object} Activity summary
 */
export function generateActivitySummary(hourlyActivity, dailyActivity) {
  const totalHourly = hourlyActivity.reduce((sum, val) => sum + val, 0);
  const totalDaily = dailyActivity.reduce((sum, val) => sum + val, 0);

  // Find peak hours
  const morningActivity = hourlyActivity.slice(6, 12).reduce((sum, val) => sum + val, 0);
  const afternoonActivity = hourlyActivity.slice(12, 18).reduce((sum, val) => sum + val, 0);
  const eveningActivity = hourlyActivity.slice(18, 24).reduce((sum, val) => sum + val, 0);
  const nightActivity = [...hourlyActivity.slice(0, 6), ...hourlyActivity.slice(24)].reduce((sum, val) => sum + val, 0);

  const peakPeriod = Math.max(morningActivity, afternoonActivity, eveningActivity, nightActivity);
  let peakPeriodName = 'Morning';
  if (peakPeriod === afternoonActivity) peakPeriodName = 'Afternoon';
  else if (peakPeriod === eveningActivity) peakPeriodName = 'Evening';
  else if (peakPeriod === nightActivity) peakPeriodName = 'Night';

  // Weekday vs weekend
  const weekdayActivity = dailyActivity.slice(1, 6).reduce((sum, val) => sum + val, 0);
  const weekendActivity = dailyActivity[0] + dailyActivity[6];

  return {
    totalActivity: totalDaily,
    peakPeriod: peakPeriodName,
    weekdayActivity,
    weekendActivity,
    weekdayPercent: totalDaily > 0 ? weekdayActivity / totalDaily : 0,
    weekendPercent: totalDaily > 0 ? weekendActivity / totalDaily : 0
  };
}
