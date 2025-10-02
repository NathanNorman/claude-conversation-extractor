/**
 * Sparklines
 *
 * Generate compact ASCII sparkline charts for showing trends.
 * Uses Unicode block characters to create mini inline charts.
 */

const SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

/**
 * Generate a sparkline from a data series
 * @param {Array<number>} data - Numeric data points
 * @param {Object} options - Display options
 * @returns {string} Sparkline string
 */
export function generateSparkline(data, options = {}) {
  const {
    min = null,
    max = null,
    height = 8 // Number of levels (matches SPARK_CHARS)
  } = options;

  if (!data || data.length === 0) {
    return '';
  }

  // Filter out null/undefined values
  const validData = data.filter(v => v !== null && v !== undefined && !isNaN(v));

  if (validData.length === 0) {
    return '';
  }

  // Determine min/max
  const dataMin = min !== null ? min : Math.min(...validData);
  const dataMax = max !== null ? max : Math.max(...validData);

  // Handle case where all values are the same
  if (dataMin === dataMax) {
    return SPARK_CHARS[Math.floor(SPARK_CHARS.length / 2)].repeat(data.length);
  }

  const range = dataMax - dataMin;

  // Map each value to a spark character
  const sparkline = data.map(value => {
    if (value === null || value === undefined || isNaN(value)) {
      return ' '; // Empty space for missing data
    }

    const normalized = (value - dataMin) / range;
    const index = Math.min(
      Math.floor(normalized * (SPARK_CHARS.length - 1)),
      SPARK_CHARS.length - 1
    );

    return SPARK_CHARS[Math.max(0, index)];
  }).join('');

  return sparkline;
}

/**
 * Generate a sparkline with labels
 * @param {Array<number>} data - Numeric data points
 * @param {Object} options - Display options
 * @returns {string} Formatted sparkline with min/max labels
 */
export function generateLabeledSparkline(data, options = {}) {
  const {
    label = '',
    showMinMax = true,
    showCurrent = true
  } = options;

  const sparkline = generateSparkline(data, options);

  if (!sparkline) {
    return '';
  }

  const validData = data.filter(v => v !== null && v !== undefined && !isNaN(v));
  const min = Math.min(...validData);
  const max = Math.max(...validData);
  const current = validData[validData.length - 1];

  let result = '';

  if (label) {
    result += `${label}: `;
  }

  result += sparkline;

  const annotations = [];
  if (showMinMax) {
    annotations.push(`min: ${min}`);
    annotations.push(`max: ${max}`);
  }
  if (showCurrent && current !== undefined) {
    annotations.push(`current: ${current}`);
  }

  if (annotations.length > 0) {
    result += ` (${annotations.join(', ')})`;
  }

  return result;
}

/**
 * Generate a trend indicator (↗ ↘ →)
 * @param {Array<number>} data - Recent data points
 * @returns {string} Trend arrow
 */
export function generateTrendIndicator(data) {
  if (!data || data.length < 2) {
    return '→';
  }

  // Use last few points to determine trend
  const recentData = data.slice(-5).filter(v => v !== null && v !== undefined && !isNaN(v));

  if (recentData.length < 2) {
    return '→';
  }

  const first = recentData[0];
  const last = recentData[recentData.length - 1];
  const diff = last - first;
  const threshold = (Math.max(...recentData) - Math.min(...recentData)) * 0.1;

  if (diff > threshold) {
    return '↗'; // Trending up
  } else if (diff < -threshold) {
    return '↘'; // Trending down
  } else {
    return '→'; // Stable
  }
}

/**
 * Generate a bar chart using block characters
 * @param {Array<number>} data - Data points
 * @param {number} maxWidth - Maximum width in characters
 * @returns {Array<string>} Array of bar strings
 */
export function generateBarChart(data, maxWidth = 20) {
  if (!data || data.length === 0) {
    return [];
  }

  const max = Math.max(...data);

  if (max === 0) {
    return data.map(() => '');
  }

  return data.map(value => {
    const barLength = Math.round((value / max) * maxWidth);
    return '█'.repeat(barLength);
  });
}
