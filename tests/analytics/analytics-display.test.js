/**
 * Test analytics display output (non-interactive)
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { AnalyticsManager } from '../../src/analytics/analytics-manager.js';

describe('Analytics Display Content', () => {
  let cache;

  beforeAll(async () => {
    const manager = new AnalyticsManager();
    await manager.initialize();

    // Ensure we have fresh analytics
    await manager.computeAnalytics({ force: true });
    cache = manager.getCache();
  });

  describe('Analytics Data Structure', () => {
    it('should have all required sections', () => {
      expect(cache).toHaveProperty('overview');
      expect(cache).toHaveProperty('conversationStats');
      expect(cache).toHaveProperty('timePatterns');
      expect(cache).toHaveProperty('productivityMetrics');
      expect(cache).toHaveProperty('userActions');
      expect(cache).toHaveProperty('milestones');
      expect(cache).toHaveProperty('comparative');
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
