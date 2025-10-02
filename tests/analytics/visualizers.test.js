/**
 * Tests for Visualizers (sparklines, formatters, heatmap)
 */

import { generateSparkline, generateTrendIndicator, generateBarChart } from '../../src/analytics/visualizers/sparklines.js';
import { formatStreak, formatHour, formatDuration, formatPercent, formatRelativeTime } from '../../src/analytics/visualizers/formatters.js';
import { generateActivityHeatmap, generateActivitySummary } from '../../src/analytics/visualizers/heatmap.js';

describe('Sparklines', () => {
  describe('generateSparkline', () => {
    test('should generate sparkline for data', () => {
      const data = [1, 2, 3, 4, 5];
      const result = generateSparkline(data);
      expect(result).toBeTruthy();
      expect(result.length).toBe(5);
    });

    test('should handle empty data', () => {
      const result = generateSparkline([]);
      expect(result).toBe('');
    });

    test('should handle all same values', () => {
      const data = [5, 5, 5, 5];
      const result = generateSparkline(data);
      expect(result).toBeTruthy();
      expect(result.length).toBe(4);
    });

    test('should handle null values', () => {
      const data = [1, null, 3, null, 5];
      const result = generateSparkline(data);
      expect(result).toBeTruthy();
      expect(result.length).toBe(5);
    });
  });

  describe('generateTrendIndicator', () => {
    test('should return up arrow for increasing trend', () => {
      const data = [1, 2, 3, 4, 5];
      const result = generateTrendIndicator(data);
      expect(result).toBe('↗');
    });

    test('should return down arrow for decreasing trend', () => {
      const data = [5, 4, 3, 2, 1];
      const result = generateTrendIndicator(data);
      expect(result).toBe('↘');
    });

    test('should return stable for flat trend', () => {
      const data = [5, 5, 5, 5, 5];
      const result = generateTrendIndicator(data);
      expect(result).toBe('→');
    });

    test('should handle small datasets', () => {
      const result = generateTrendIndicator([1]);
      expect(result).toBe('→');
    });
  });

  describe('generateBarChart', () => {
    test('should generate bars proportional to data', () => {
      const data = [10, 5, 8];
      const result = generateBarChart(data, 10);
      expect(result).toHaveLength(3);
      expect(result[0].length).toBeGreaterThan(result[1].length);
    });

    test('should handle empty data', () => {
      const result = generateBarChart([]);
      expect(result).toEqual([]);
    });

    test('should handle all zeros', () => {
      const result = generateBarChart([0, 0, 0]);
      expect(result).toEqual(['', '', '']);
    });
  });
});

describe('Formatters', () => {
  describe('formatStreak', () => {
    test('should format zero days', () => {
      expect(formatStreak(0)).toBe('0 days');
    });

    test('should format single day', () => {
      expect(formatStreak(1)).toBe('🔥 1 day');
    });

    test('should format multiple days', () => {
      expect(formatStreak(5)).toBe('🔥 5 days');
    });
  });

  describe('formatHour', () => {
    test('should format midnight', () => {
      expect(formatHour(0)).toBe('12 AM');
    });

    test('should format noon', () => {
      expect(formatHour(12)).toBe('12 PM');
    });

    test('should format morning hours', () => {
      expect(formatHour(9)).toBe('9 AM');
    });

    test('should format afternoon hours', () => {
      expect(formatHour(15)).toBe('3 PM');
    });
  });

  describe('formatDuration', () => {
    test('should format seconds', () => {
      expect(formatDuration(5000)).toBe('5s');
    });

    test('should format minutes', () => {
      expect(formatDuration(120000)).toBe('2m');
    });

    test('should format hours', () => {
      expect(formatDuration(7200000)).toBe('2h 0m');
    });

    test('should format days', () => {
      expect(formatDuration(90000000)).toBe('1d 1h');
    });
  });

  describe('formatPercent', () => {
    test('should format percentage with default decimals', () => {
      expect(formatPercent(0.5)).toBe('50.0%');
    });

    test('should format percentage with custom decimals', () => {
      expect(formatPercent(0.333, 2)).toBe('33.30%');
    });

    test('should handle zero', () => {
      expect(formatPercent(0)).toBe('0.0%');
    });

    test('should handle one', () => {
      expect(formatPercent(1)).toBe('100.0%');
    });
  });

  describe('formatRelativeTime', () => {
    test('should format recent time as "just now"', () => {
      const now = new Date();
      expect(formatRelativeTime(now)).toBe('just now');
    });

    test('should format minutes ago', () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      expect(formatRelativeTime(fiveMinutesAgo)).toBe('5 minutes ago');
    });

    test('should format hours ago', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      expect(formatRelativeTime(twoHoursAgo)).toBe('2 hours ago');
    });

    test('should format days ago', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(threeDaysAgo)).toBe('3 days ago');
    });
  });
});

describe('Heatmap', () => {
  describe('generateActivityHeatmap', () => {
    test('should generate heatmap from activity data', () => {
      const hourlyActivity = Array(24).fill(5);
      hourlyActivity[12] = 20; // Noon spike

      const dailyActivity = Array(7).fill(10);
      dailyActivity[3] = 30; // Wednesday spike

      const result = generateActivityHeatmap(hourlyActivity, dailyActivity);
      expect(result).toBeTruthy();
      expect(result.includes('Sun')).toBe(true);
      expect(result.includes('Mon')).toBe(true);
      expect(result.includes('Wed')).toBe(true);
    });

    test('should handle null inputs', () => {
      const result = generateActivityHeatmap(null, null);
      expect(result).toBe('No activity data available');
    });

    test('should handle empty activity', () => {
      const hourlyActivity = Array(24).fill(0);
      const dailyActivity = Array(7).fill(0);

      const result = generateActivityHeatmap(hourlyActivity, dailyActivity);
      expect(result).toBeTruthy();
    });
  });

  describe('generateActivitySummary', () => {
    test('should calculate weekday vs weekend split', () => {
      const hourlyActivity = Array(24).fill(1);
      const dailyActivity = [1, 5, 5, 5, 5, 5, 1]; // Mostly weekdays

      const result = generateActivitySummary(hourlyActivity, dailyActivity);
      expect(result.weekdayActivity).toBe(25);
      expect(result.weekendActivity).toBe(2);
      expect(result.weekdayPercent).toBeGreaterThan(0.9);
    });

    test('should identify peak period', () => {
      const hourlyActivity = Array(24).fill(1);
      hourlyActivity[14] = 20; // Afternoon spike

      const dailyActivity = Array(7).fill(5);

      const result = generateActivitySummary(hourlyActivity, dailyActivity);
      expect(result.peakPeriod).toBe('Afternoon');
    });
  });
});
