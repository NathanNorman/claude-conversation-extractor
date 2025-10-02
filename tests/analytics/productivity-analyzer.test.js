/**
 * Tests for Productivity Analyzer
 */

import { analyzeProductivity } from '../../src/analytics/analyzers/productivity-analyzer.js';

describe('Productivity Analyzer', () => {
  describe('analyzeProductivity', () => {
    test('should handle empty conversations', () => {
      const result = analyzeProductivity([], {}, {});
      expect(result.conversationsPerWeek).toBe(0);
      expect(result.messagesPerDay).toBe(0);
      expect(result.toolsPerConversation).toBe(0);
    });

    test('should calculate conversations per week', () => {
      const conversations = Array.from({ length: 14 }, (_, i) => ({
        firstTimestamp: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
        lastTimestamp: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
        messageCount: 10
      }));

      const result = analyzeProductivity(conversations, {}, {});
      expect(result.conversationsPerWeek).toBeGreaterThan(0);
      expect(result.conversationsPerWeek).toBeLessThan(20); // ~14 convs in ~2 weeks
    });

    test('should calculate messages per day', () => {
      const conversations = [
        {
          firstTimestamp: '2025-10-01T10:00:00Z',
          lastTimestamp: '2025-10-01T11:00:00Z',
          messageCount: 50
        },
        {
          firstTimestamp: '2025-10-03T10:00:00Z',
          lastTimestamp: '2025-10-03T11:00:00Z',
          messageCount: 50
        }
      ];

      const result = analyzeProductivity(conversations, {}, {});
      expect(result.messagesPerDay).toBeGreaterThan(0);
      // 100 messages over ~2-3 days
      expect(result.messagesPerDay).toBeLessThan(60);
    });

    test('should calculate tools per conversation', () => {
      const conversations = [
        { messageCount: 10 },
        { messageCount: 20 }
      ];

      const toolUsage = { total: 60 };

      const result = analyzeProductivity(conversations, {}, toolUsage);
      expect(result.toolsPerConversation).toBe(30); // 60 tools / 2 conversations
    });

    test('should classify deep work sessions', () => {
      const conversations = [
        { durationMs: 35 * 60 * 1000, messageCount: 50 }, // >30 min = deep work
        { durationMs: 45 * 60 * 1000, messageCount: 60 }, // >30 min = deep work
        { durationMs: 3 * 60 * 1000, messageCount: 5 },   // <5 min = quick
        { durationMs: 15 * 60 * 1000, messageCount: 20 }  // Neither
      ];

      const result = analyzeProductivity(conversations, {}, {});
      expect(result.deepWorkSessions).toBe(2);
      expect(result.quickQuestions).toBe(1);
    });

    test('should calculate weekend activity', () => {
      const conversations = [
        { firstTimestamp: '2025-10-01T10:00:00Z', messageCount: 10 }
      ];

      const timePatterns = {
        dailyActivity: [5, 10, 10, 10, 10, 10, 3] // Sun=5, Mon-Fri=10, Sat=3
      };

      const result = analyzeProductivity(conversations, timePatterns, {});
      expect(result.weekendActivity).toBeCloseTo(8 / 58, 2); // (5+3) / 58
    });

    test('should calculate average session length', () => {
      const conversations = [
        { durationMs: 30 * 60 * 1000 }, // 30 min
        { durationMs: 60 * 60 * 1000 }  // 60 min
      ];

      const result = analyzeProductivity(conversations, {}, {});
      expect(result.avgSessionLength).toBe(2700); // Average 45 min = 2700 seconds
    });

    test('should handle conversations without durations', () => {
      const conversations = [
        { messageCount: 10 },
        { messageCount: 20 }
      ];

      const result = analyzeProductivity(conversations, {}, {});
      expect(result.avgSessionLength).toBe(0);
      expect(result.deepWorkSessions).toBe(0);
      expect(result.quickQuestions).toBe(0);
    });
  });
});
