/**
 * Tests for Milestone Analyzer
 */

import { analyzeMilestones, getBadgeInfo } from '../../src/analytics/analyzers/milestone-analyzer.js';

describe('Milestone Analyzer', () => {
  describe('analyzeMilestones', () => {
    test('should award first conversation badge', () => {
      const cache = {
        overview: { totalConversations: 1 },
        timePatterns: { streaks: { longest: 0, current: 0 } },
        productivityMetrics: { deepWorkSessions: 0, weekendActivity: 0 },
        toolUsage: { byTool: {} }
      };

      const result = analyzeMilestones(cache);
      expect(result.badges).toContain('first_conversation');
    });

    test('should award century club badge at 100 conversations', () => {
      const cache = {
        overview: { totalConversations: 100, totalMessages: 5000 },
        timePatterns: { streaks: { longest: 2, current: 1 } },
        productivityMetrics: { deepWorkSessions: 10, weekendActivity: 0.1 },
        toolUsage: { byTool: { Bash: 500 } }
      };

      const result = analyzeMilestones(cache);
      expect(result.badges).toContain('conversations_100');
    });

    test('should award command power user badge', () => {
      const cache = {
        overview: { totalConversations: 50, totalMessages: 2000 },
        timePatterns: { streaks: { longest: 1, current: 1 } },
        productivityMetrics: { deepWorkSessions: 5, weekendActivity: 0.2 },
        userActions: {
          slashCommands: {
            total: 60,
            byCommand: {
              '/custom-cmd-1': 20,
              '/custom-cmd-2': 15,
              '/custom-cmd-3': 10,
              '/custom-cmd-4': 8,
              '/custom-cmd-5': 7
            }
          }
        }
      };

      const result = analyzeMilestones(cache);
      expect(result.badges).toContain('command_power_user'); // 50+ commands
      expect(result.badges).toContain('command_variety'); // 5+ different commands
    });

    test('should award streak badges', () => {
      const cache = {
        overview: { totalConversations: 20, totalMessages: 1000 },
        timePatterns: { streaks: { longest: 7, current: 5 } },
        productivityMetrics: { deepWorkSessions: 5, weekendActivity: 0.1 },
        toolUsage: { byTool: {} }
      };

      const result = analyzeMilestones(cache);
      expect(result.badges).toContain('streak_3');
      expect(result.badges).toContain('streak_7');
      expect(result.badges).not.toContain('streak_30');
    });

    test('should award early bird badge', () => {
      const cache = {
        overview: { totalConversations: 10, totalMessages: 500 },
        timePatterns: {
          streaks: { longest: 1, current: 1 },
          busiestHour: 7 // 7 AM
        },
        productivityMetrics: { deepWorkSessions: 2, weekendActivity: 0.1 },
        toolUsage: { byTool: {} }
      };

      const result = analyzeMilestones(cache);
      expect(result.badges).toContain('early_bird');
    });

    test('should award night owl badge', () => {
      const cache = {
        overview: { totalConversations: 10, totalMessages: 500 },
        timePatterns: {
          streaks: { longest: 1, current: 1 },
          busiestHour: 23 // 11 PM
        },
        productivityMetrics: { deepWorkSessions: 2, weekendActivity: 0.1 },
        toolUsage: { byTool: {} }
      };

      const result = analyzeMilestones(cache);
      expect(result.badges).toContain('night_owl');
    });

    test('should award deep thinker badge', () => {
      const cache = {
        overview: { totalConversations: 30, totalMessages: 15000 },
        timePatterns: { streaks: { longest: 2, current: 1 } },
        productivityMetrics: { deepWorkSessions: 25, weekendActivity: 0.1 },
        toolUsage: { byTool: {} }
      };

      const result = analyzeMilestones(cache);
      expect(result.badges).toContain('deep_thinker');
    });

    test('should award prolific coder badge', () => {
      const cache = {
        overview: { totalConversations: 100, totalMessages: 12000 },
        timePatterns: { streaks: { longest: 3, current: 2 } },
        productivityMetrics: { deepWorkSessions: 10, weekendActivity: 0.15 },
        toolUsage: { byTool: {} }
      };

      const result = analyzeMilestones(cache);
      expect(result.badges).toContain('prolific_coder');
    });

    test('should calculate achievements correctly', () => {
      const cache = {
        overview: { totalConversations: 50, totalMessages: 2500 },
        timePatterns: { streaks: { longest: 3, current: 2 } },
        productivityMetrics: { deepWorkSessions: 10, weekendActivity: 0.1 },
        userActions: {
          slashCommands: {
            total: 75,
            byCommand: {
              '/youre-not-done': 20,
              '/implement-from-markdown': 10,
              '/debug': 8
            }
          }
        },
        conversationStats: {
          byProject: {
            'project1': { count: 20 },
            'project2': { count: 15 },
            'project3': { count: 15 }
          }
        }
      };

      const result = analyzeMilestones(cache);
      expect(result.achievements.projectsWorked).toBe(3);
      expect(result.achievements.commandsMastered).toContain('/youre-not-done');
      expect(result.achievements.commandsMastered).toContain('/implement-from-markdown');
      expect(result.achievements.commandsMastered).toContain('/debug');
      expect(result.achievements.totalCustomCommands).toBe(75);
    });

    test('should find next milestones', () => {
      const cache = {
        overview: { totalConversations: 45, totalMessages: 2000 },
        timePatterns: { streaks: { longest: 4, current: 2 } },
        productivityMetrics: { deepWorkSessions: 8, weekendActivity: 0.1 },
        toolUsage: { byTool: {} },
        conversationStats: { byProject: {} }
      };

      const result = analyzeMilestones(cache);
      expect(result.nextMilestones).toBeDefined();
      expect(result.nextMilestones.length).toBeGreaterThan(0);

      // Should be working toward 50 conversations
      const nextConvMilestone = result.nextMilestones.find(m => m.name.includes('50'));
      expect(nextConvMilestone).toBeDefined();
      expect(nextConvMilestone.progress).toBe(45);
      expect(nextConvMilestone.target).toBe(50);
    });

    test('should calculate progress percentage correctly', () => {
      const cache = {
        overview: { totalConversations: 75, totalMessages: 5000 },
        timePatterns: { streaks: { longest: 5, current: 3 } },
        productivityMetrics: { deepWorkSessions: 15, weekendActivity: 0.1 },
        toolUsage: { byTool: {} },
        conversationStats: { byProject: {} }
      };

      const result = analyzeMilestones(cache);
      const nextConvMilestone = result.nextMilestones.find(m => m.name.includes('100'));

      if (nextConvMilestone) {
        expect(nextConvMilestone.percentage).toBe(75); // 75 out of 100 = 75%
      }
    });
  });

  describe('getBadgeInfo', () => {
    test('should return badge info for valid badge ID', () => {
      const badge = getBadgeInfo('first_conversation');
      expect(badge).toBeDefined();
      expect(badge.name).toBe('First Steps');
      expect(badge.emoji).toBe('🎯');
      expect(badge.description).toBeTruthy();
    });

    test('should return null for invalid badge ID', () => {
      const badge = getBadgeInfo('nonexistent_badge');
      expect(badge).toBe(null);
    });

    test('should have criteria function', () => {
      const badge = getBadgeInfo('command_user');
      expect(badge).toBeDefined();
      expect(typeof badge.criteria).toBe('function');
    });
  });
});
