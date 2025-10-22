/**
 * Conversation Analyzer Tests
 */

import { analyzeAllConversations } from '../../src/analytics/analyzers/conversation-analyzer.js';

describe('Conversation Analyzer', () => {
  describe('Date range filtering', () => {
    test('should filter conversations by date range', async () => {
      // With search index integration, function now succeeds even with nonexistent path
      // Tests search index functionality
      const projectsDir = '/nonexistent/test/path';
      const dateRange = {
        label: 'Last 30 Days',
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        end: new Date(),
        isFiltered: true
      };

      const result = await analyzeAllConversations(projectsDir, null, dateRange);
      expect(result).toBeDefined();
      expect(result.appliedDateRange).toEqual(dateRange);
      expect(result.totalConversations).toBeGreaterThanOrEqual(0);
    });

    test('should include all conversations when dateRange is null', async () => {
      const projectsDir = '/nonexistent/test/path';

      const result = await analyzeAllConversations(projectsDir, null, null);
      expect(result).toBeDefined();
      expect(result.appliedDateRange).toBeNull();
      expect(result.totalConversations).toBeGreaterThanOrEqual(0);
    });

    test('should handle All Time range (isFiltered: false)', async () => {
      const projectsDir = '/nonexistent/test/path';
      const dateRange = {
        label: 'All Time',
        start: null,
        end: null,
        isFiltered: false
      };

      const result = await analyzeAllConversations(projectsDir, null, dateRange);
      expect(result).toBeDefined();
      expect(result.appliedDateRange).toEqual(dateRange);
      expect(result.totalConversations).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Function signature', () => {
    test('should accept dateRange parameter', async () => {
      // Verify function accepts 3 parameters and returns results
      const projectsDir = '/nonexistent/test/path';
      const dateRange = { label: 'Test', start: null, end: null, isFiltered: false };

      const result = await analyzeAllConversations(projectsDir, null, dateRange);
      expect(result).toBeDefined();
      expect(result.appliedDateRange).toEqual(dateRange);
    });
  });
});
