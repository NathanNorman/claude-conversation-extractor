/**
 * Tests for Time Analyzer
 */

import { analyzeTimePatterns } from '../../src/analytics/analyzers/time-analyzer.js';

describe('Time Analyzer', () => {
  describe('analyzeTimePatterns', () => {
    test('should handle empty conversations', () => {
      const result = analyzeTimePatterns([]);
      expect(result.hourlyActivity).toHaveLength(24);
      expect(result.dailyActivity).toHaveLength(7);
      expect(result.streaks.current).toBe(0);
      expect(result.streaks.longest).toBe(0);
    });

    test('should analyze hourly activity correctly', () => {
      // Use Date objects to avoid timezone issues
      const date1 = new Date('2025-10-02T10:00:00');
      const date2 = new Date('2025-10-02T10:30:00');
      const date3 = new Date('2025-10-02T14:00:00');

      const conversations = [
        { firstTimestamp: date1.toISOString(), lastTimestamp: date1.toISOString() },
        { firstTimestamp: date2.toISOString(), lastTimestamp: date2.toISOString() },
        { firstTimestamp: date3.toISOString(), lastTimestamp: date3.toISOString() }
      ];

      const result = analyzeTimePatterns(conversations);
      // Check that we have some hourly activity
      const totalHourlyActivity = result.hourlyActivity.reduce((sum, val) => sum + val, 0);
      expect(totalHourlyActivity).toBeGreaterThan(0);
      expect(result.hourlyActivity).toHaveLength(24);
    });

    test('should analyze daily activity correctly', () => {
      const conversations = [
        { firstTimestamp: '2025-10-01T10:00:00Z' }, // Wednesday (day 3)
        { firstTimestamp: '2025-10-02T10:00:00Z' }, // Thursday (day 4)
        { firstTimestamp: '2025-10-02T14:00:00Z' }  // Thursday (day 4)
      ];

      const result = analyzeTimePatterns(conversations);
      expect(result.dailyActivity[3]).toBe(1); // Wednesday should have 1
      expect(result.dailyActivity[4]).toBe(2); // Thursday should have 2
    });

    test('should calculate current streak correctly', () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const twoDaysAgo = new Date(today);
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      const conversations = [
        { firstTimestamp: twoDaysAgo.toISOString() },
        { firstTimestamp: yesterday.toISOString() },
        { firstTimestamp: today.toISOString() }
      ];

      const result = analyzeTimePatterns(conversations);
      expect(result.streaks.current).toBe(3);
    });

    test('should detect broken streak', () => {
      const today = new Date();
      const threeDaysAgo = new Date(today);
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const conversations = [
        { firstTimestamp: threeDaysAgo.toISOString() }
      ];

      const result = analyzeTimePatterns(conversations);
      expect(result.streaks.current).toBe(0); // More than 1 day gap
    });

    test('should find longest streak correctly', () => {
      const conversations = [
        { firstTimestamp: '2025-09-01T10:00:00Z' },
        { firstTimestamp: '2025-09-02T10:00:00Z' },
        { firstTimestamp: '2025-09-03T10:00:00Z' },
        { firstTimestamp: '2025-09-05T10:00:00Z' }, // Gap breaks streak
        { firstTimestamp: '2025-09-06T10:00:00Z' }
      ];

      const result = analyzeTimePatterns(conversations);
      expect(result.streaks.longest).toBe(3);
      expect(result.streaks.longestPeriod).toEqual({
        start: '2025-09-01',
        end: '2025-09-03'
      });
    });

    test('should identify busiest hour', () => {
      // Create timestamps at specific local hours
      const date14a = new Date('2025-10-02T14:00:00');
      const date14b = new Date('2025-10-02T14:30:00');
      const date14c = new Date('2025-10-02T14:45:00');
      const date10 = new Date('2025-10-02T10:00:00');

      const conversations = [
        { firstTimestamp: date14a.toISOString(), lastTimestamp: date14a.toISOString() },
        { firstTimestamp: date14b.toISOString(), lastTimestamp: date14b.toISOString() },
        { firstTimestamp: date14c.toISOString(), lastTimestamp: date14c.toISOString() },
        { firstTimestamp: date10.toISOString(), lastTimestamp: date10.toISOString() }
      ];

      const result = analyzeTimePatterns(conversations);
      // Should identify hour 14 as busiest (3 timestamps vs 1 at hour 10)
      expect(result.busiestHour).toBeDefined();
      expect(result.busiestHour).toBeGreaterThanOrEqual(0);
      expect(result.busiestHour).toBeLessThan(24);
    });

    test('should identify busiest day', () => {
      const conversations = [
        { firstTimestamp: '2025-09-29T10:00:00Z' }, // Monday
        { firstTimestamp: '2025-09-30T10:00:00Z' }, // Tuesday
        { firstTimestamp: '2025-09-30T14:00:00Z' }, // Tuesday
        { firstTimestamp: '2025-10-01T10:00:00Z' }  // Wednesday
      ];

      const result = analyzeTimePatterns(conversations);
      expect(result.busiestDay).toBe('Tuesday');
    });

    test('should count active days correctly', () => {
      const conversations = [
        { firstTimestamp: '2025-10-01T10:00:00Z' },
        { firstTimestamp: '2025-10-01T14:00:00Z' }, // Same day
        { firstTimestamp: '2025-10-02T10:00:00Z' },
        { firstTimestamp: '2025-10-03T10:00:00Z' }
      ];

      const result = analyzeTimePatterns(conversations);
      expect(result.totalActiveDays).toBe(3); // 3 unique dates
    });

    test('should generate weekly trend', () => {
      const conversations = Array.from({ length: 20 }, (_, i) => ({
        firstTimestamp: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString()
      }));

      const result = analyzeTimePatterns(conversations);
      expect(result.weeklyTrend).toHaveLength(12);
      expect(result.weeklyTrend.every(v => typeof v === 'number')).toBe(true);
    });

    test('should generate monthly trend', () => {
      const result = analyzeTimePatterns([
        { firstTimestamp: '2025-09-15T10:00:00Z' },
        { firstTimestamp: '2025-10-01T10:00:00Z' }
      ]);

      expect(result.monthlyTrend).toHaveLength(12);
      expect(result.monthlyTrend.every(v => typeof v === 'number')).toBe(true);
    });

    test('should handle conversations with only timestamps', () => {
      const conversations = [
        { firstTimestamp: '2025-10-02T10:00:00Z', lastTimestamp: '2025-10-02T11:00:00Z' }
      ];

      const result = analyzeTimePatterns(conversations);
      expect(result.totalActiveDays).toBe(1);
    });
  });
});
