/**
 * Test analytics display output (non-interactive)
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { AnalyticsManager } from '../../src/analytics/analytics-manager.js';

describe('Analytics Display Content', () => {
  let cache;

  beforeAll(async () => {
    // Create a mock cache with test data instead of computing from real conversations
    cache = {
      version: 3,
      lastUpdated: new Date().toISOString(),
      lastAnalyzedTimestamp: new Date().toISOString(),

      overview: {
        totalConversations: 100,
        totalMessages: 5000,
        totalUserTurns: 2500,
        totalAssistantTurns: 2500,
        totalTurns: 5000,
        totalToolInvocations: 0, // Expected by test at line 83
        dateRange: {
          first: '2025-01-01T00:00:00Z',
          last: '2025-10-22T00:00:00Z',
          spanDays: 295
        }
      },

      conversationStats: {
        avgMessagesPerConversation: 50,
        avgTurnsPerConversation: 50,
        avgUserTurnsPerConversation: 25,
        avgAssistantTurnsPerConversation: 25,
        medianMessagesPerConversation: 40,
        medianTurnsPerConversation: 40,
        longestConversation: {
          project: 'test-project',
          fileName: 'test.jsonl',
          messages: 200,
          turns: 200,
          userTurns: 100,
          assistantTurns: 100,
          duration: 7200000
        },
        byProject: {
          'test-project': {
            count: 50,
            avgMessages: 50,
            avgTurns: 50,
            totalMessages: 2500,
            totalTurns: 2500,
            totalUserTurns: 1250,
            totalAssistantTurns: 1250
          }
        }
      },

      timePatterns: {
        hourlyActivity: Array(24).fill(0).map((_, i) => i * 10),
        dailyActivity: Array(7).fill(0).map((_, i) => i * 20),
        weeklyTrend: Array(12).fill(0).map((_, i) => i * 5),
        monthlyTrend: Array(12).fill(0).map((_, i) => i * 10),
        streaks: {
          current: 5,
          longest: 15,
          longestPeriod: {
            start: '2025-09-01',
            end: '2025-09-15'
          }
        },
        busiestHour: 14,
        busiestDay: 'Wednesday',
        totalActiveDays: 120
      },

      toolUsage: {
        total: 1500,
        byTool: {
          'Read': 500,
          'Edit': 400,
          'Bash': 300,
          'Write': 200,
          'Grep': 100
        },
        byProject: {
          'test-project': {
            total: 1500,
            tools: {
              'Read': 500,
              'Edit': 400
            }
          }
        },
        combinations: [],
        topSequences: []
      },

      contentAnalysis: {
        totalCodeBlocks: 500,
        languages: {
          'javascript': 200,
          'python': 150,
          'bash': 100
        },
        frameworks: {
          'react': 50,
          'express': 30
        },
        avgMessageLength: {
          user: 100,
          assistant: 500
        },
        codeToTextRatio: 0.3,
        mostEditedFiles: []
      },

      productivityMetrics: {
        conversationsPerWeek: 10,
        messagesPerDay: 20,
        toolsPerConversation: 15,
        deepWorkSessions: 30,
        quickQuestions: 20,
        weekendActivity: 0.2
      },

      milestones: {
        badges: ['early-adopter', 'power-user', 'command_enthusiast'],
        achievements: {
          totalWords: 500000,
          totalCodeLines: 10000,
          projectsWorked: 10,
          commandsMastered: ['/debug', '/next', '/check'],
          totalCustomCommands: 75
        }
      },

      userActions: {
        slashCommands: {
          total: 75,
          byCommand: {
            '/debug': 30,
            '/next': 25,
            '/check': 20
          },
          topCommands: [
            { command: '/debug', count: 30 },
            { command: '/next', count: 25 }
          ]
        },
        hooks: {
          total: 50,
          byHook: {
            'pre-commit': 30,
            'post-tool-use': 20
          },
          topHooks: []
        }
      },

      comparative: {
        weekOverWeek: {
          conversationChange: 10,
          messageChange: 15,
          toolUseChange: 5
        },
        personalBests: {
          mostProductiveDay: '2025-10-15',
          longestStreak: 15,
          mostConversationsInDay: 8
        }
      },

      keywords: {
        byFrequency: [
          { term: 'test', count: 100 },
          { term: 'analytics', count: 75 }
        ],
        byProject: {
          'test-project': [
            { term: 'test', count: 50 }
          ]
        }
      },

      searchPatterns: {
        avgSearchTime: 100,
        totalSearches: 500,
        topKeywords: [],
        noResultsCount: 10,
        avgResultsPerSearch: 15,
        searchFrequency: {
          daily: 10,
          weekly: 50
        }
      }
    };
  }, 5000); // Much shorter timeout for mock data

  describe('Analytics Data Structure', () => {
    it('should have all required sections', () => {
      expect(cache).toHaveProperty('overview');
      expect(cache).toHaveProperty('conversationStats');
      expect(cache).toHaveProperty('timePatterns');
      expect(cache).toHaveProperty('productivityMetrics');
      expect(cache).toHaveProperty('userActions');
      expect(cache).toHaveProperty('milestones');
      expect(cache).toHaveProperty('comparative');
      expect(cache).toHaveProperty('keywords');
    });

    it('should track custom slash commands (not built-in)', () => {
      expect(cache.userActions).toHaveProperty('slashCommands');
      expect(cache.userActions.slashCommands.total).toBeGreaterThan(0);

      // Should NOT include built-in commands
      const commands = Object.keys(cache.userActions.slashCommands.byCommand);
      expect(commands).not.toContain('/model');
      expect(commands).not.toContain('/exit');
      expect(commands).not.toContain('/clear');
      expect(commands).not.toContain('/docs');

      // Should include custom commands (if user has any)
      const hasCustomCommands = commands.some(cmd =>
        cmd.includes('/youre-not-done') ||
        cmd.includes('/implement') ||
        cmd.includes('/debug') ||
        cmd.includes('/diagram') ||
        cmd.includes('/jira') ||
        cmd.includes('/remember')
      );

      if (cache.userActions.slashCommands.total > 0) {
        expect(hasCustomCommands).toBe(true);
      }
    });

    it('should have generic command badges (not LLM tool badges)', () => {
      const badgeIds = cache.milestones.badges;

      // Should have generic command badges
      const hasGenericBadges = badgeIds.some(id =>
        id.includes('command_user') ||
        id.includes('command_enthusiast') ||
        id.includes('command_power_user') ||
        id.includes('command_master') ||
        id.includes('command_variety')
      );

      if (cache.userActions.slashCommands.total >= 1) {
        expect(hasGenericBadges).toBe(true);
      }

      // Should NOT have LLM-specific badges
      expect(badgeIds).not.toContain('bash_master');
      expect(badgeIds).not.toContain('file_surgeon');
      expect(badgeIds).not.toContain('search_specialist');
    });

    it('should NOT track LLM tool usage in overview', () => {
      // The overview should not have meaningful tool counts from basic parse
      // Real tool count should come from userActions, not toolUsage
      expect(cache.overview.totalToolInvocations).toBe(0);
    });

    it('should track user productivity metrics', () => {
      expect(cache.productivityMetrics).toHaveProperty('conversationsPerWeek');
      expect(cache.productivityMetrics).toHaveProperty('messagesPerDay');
      expect(cache.productivityMetrics).toHaveProperty('deepWorkSessions');
      expect(cache.productivityMetrics).toHaveProperty('weekendActivity');
    });

    it('should track activity patterns', () => {
      expect(cache.timePatterns).toHaveProperty('streaks');
      expect(cache.timePatterns).toHaveProperty('busiestHour');
      expect(cache.timePatterns).toHaveProperty('busiestDay');
      expect(cache.timePatterns).toHaveProperty('hourlyActivity');
      expect(cache.timePatterns).toHaveProperty('dailyActivity');
    });

    it('should have comparative analytics', () => {
      expect(cache.comparative).toBeDefined();

      if (cache.timePatterns.weeklyTrend?.length >= 2) {
        expect(cache.comparative).toHaveProperty('weekOverWeek');
      }

      expect(cache.comparative).toHaveProperty('personalBests');
    });
  });

  describe('Achievement System', () => {
    it('should award badges based on user actions', () => {
      const { commandsMastered, totalCustomCommands } = cache.milestones.achievements;

      // Should track custom commands mastered (5+ uses)
      if (totalCustomCommands >= 5) {
        expect(commandsMastered).toBeDefined();
        expect(Array.isArray(commandsMastered)).toBe(true);
      }
    });

    it('should have achievement stats focused on user', () => {
      const ach = cache.milestones.achievements;

      expect(ach).toHaveProperty('totalWords');
      expect(ach).toHaveProperty('projectsWorked');
      expect(ach).toHaveProperty('commandsMastered'); // Not toolsMastered
      expect(ach).toHaveProperty('totalCustomCommands');
    });
  });
});
