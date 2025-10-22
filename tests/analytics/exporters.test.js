/**
 * Tests for Analytics Exporters
 */

import { exportToJSON, exportSectionToJSON } from '../../src/analytics/exporters/json-exporter.js';
import { exportToMarkdown } from '../../src/analytics/exporters/markdown-exporter.js';
import { exportToCSV } from '../../src/analytics/exporters/csv-exporter.js';
import { createEmptyCache } from '../../src/analytics/cache/schema.js';
import { readFile, rm, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Analytics Exporters', () => {
  let testDir;
  let testCache;

  beforeEach(async () => {
    testDir = join(tmpdir(), `export-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });

    testCache = createEmptyCache();
    testCache.overview.totalConversations = 100;
    testCache.overview.totalMessages = 5000;
    testCache.timePatterns.streaks = { current: 3, longest: 7 };
    testCache.toolUsage = { total: 500, byTool: { Bash: 200, Read: 150 }, combinations: [] };
    testCache.productivityMetrics = { conversationsPerWeek: 10, messagesPerDay: 50 };
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('JSON Exporter', () => {
    test('should export cache to JSON file', async () => {
      const path = await exportToJSON(testCache, {
        outputDir: testDir,
        filename: 'test.json',
        includeTimestamp: false
      });

      expect(path).toContain('test.json');

      const content = await readFile(path, 'utf8');
      const exported = JSON.parse(content);

      expect(exported.exportedAt).toBeDefined();
      expect(exported.version).toBe(3); // Updated to v3 for turn-based counting
      expect(exported.data.overview.totalConversations).toBe(100);
    });

    test('should include timestamp in filename when requested', async () => {
      const path = await exportToJSON(testCache, {
        outputDir: testDir,
        filename: 'test.json',
        includeTimestamp: true
      });

      expect(path).toMatch(/test-\d+\.json/);
    });

    test('should export pretty JSON by default', async () => {
      const path = await exportToJSON(testCache, {
        outputDir: testDir,
        filename: 'test.json',
        includeTimestamp: false,
        pretty: true
      });

      const content = await readFile(path, 'utf8');
      expect(content).toContain('\n'); // Pretty JSON has newlines
      expect(content).toContain('  '); // Pretty JSON has indentation
    });

    test('should export compact JSON when requested', async () => {
      const path = await exportToJSON(testCache, {
        outputDir: testDir,
        filename: 'test.json',
        includeTimestamp: false,
        pretty: false
      });

      const content = await readFile(path, 'utf8');
      // Compact JSON has no unnecessary whitespace
      expect(content.includes('\n  ')).toBe(false);
    });

    test('should export specific section', async () => {
      const path = await exportSectionToJSON(testCache, 'overview', {
        outputDir: testDir,
        filename: 'overview.json'
      });

      const content = await readFile(path, 'utf8');
      const exported = JSON.parse(content);

      expect(exported.section).toBe('overview');
      expect(exported.data.totalConversations).toBe(100);
    });

    test('should throw error for invalid section', async () => {
      await expect(
        exportSectionToJSON(testCache, 'nonexistent', { outputDir: testDir })
      ).rejects.toThrow('Section \'nonexistent\' not found');
    });
  });

  describe('Markdown Exporter', () => {
    test('should export cache to Markdown report', async () => {
      const path = await exportToMarkdown(testCache, {
        outputDir: testDir,
        filename: 'report.md',
        includeTimestamp: false
      });

      expect(path).toContain('report.md');

      const content = await readFile(path, 'utf8');
      expect(content).toContain('# Claude Conversation Analytics Report');
      expect(content).toContain('## 📊 Overview');
      expect(content).toContain('Total Conversations');
    });

    test('should include all sections by default', async () => {
      const path = await exportToMarkdown(testCache, {
        outputDir: testDir,
        filename: 'report.md',
        includeTimestamp: false
      });

      const content = await readFile(path, 'utf8');
      expect(content).toContain('## 📊 Overview');
      expect(content).toContain('## ⏰ Activity Patterns');
      expect(content).toContain('## 🛠️ Tool Usage');
      expect(content).toContain('## 📈 Productivity Metrics');
      expect(content).toContain('## 🏆 Milestones');
    });

    test('should export specific sections only', async () => {
      const path = await exportToMarkdown(testCache, {
        outputDir: testDir,
        filename: 'overview-only.md',
        includeTimestamp: false,
        sections: ['overview']
      });

      const content = await readFile(path, 'utf8');
      expect(content).toContain('## 📊 Overview');
      expect(content).not.toContain('## 🛠️ Tool Usage');
    });

    test('should format tables correctly', async () => {
      testCache.toolUsage.byTool = { Bash: 200, Read: 150, Edit: 100 };

      const path = await exportToMarkdown(testCache, {
        outputDir: testDir,
        filename: 'report.md',
        includeTimestamp: false
      });

      const content = await readFile(path, 'utf8');
      expect(content).toContain('| Tool |');
      expect(content).toContain('| Bash |');
    });
  });

  describe('CSV Exporter', () => {
    test('should export multiple CSV files', async () => {
      const paths = await exportToCSV(testCache, {
        outputDir: testDir,
        prefix: 'test',
        includeTimestamp: false
      });

      expect(paths.length).toBeGreaterThan(0);
      expect(paths[0]).toContain('test-overview.csv');
    });

    test('should create valid CSV format', async () => {
      const paths = await exportToCSV(testCache, {
        outputDir: testDir,
        prefix: 'test',
        includeTimestamp: false
      });

      const overviewPath = paths.find(p => p.includes('overview'));
      const content = await readFile(overviewPath, 'utf8');

      const lines = content.split('\n');
      // New format includes metadata header rows before data
      expect(lines[0]).toBe('Claude Code Analytics Report (CSV)');
      expect(lines[1]).toContain('Period,'); // Period line (e.g., "Period,All Time")
      expect(lines[2]).toContain('Generated,'); // Generated timestamp
      expect(lines[3]).toBe(''); // Blank line separator
      expect(lines[4]).toBe('Metric,Value'); // Data header
      expect(lines[5]).toBe('Total Conversations,100'); // First data row
    });

    test('should export tool usage to CSV', async () => {
      testCache.toolUsage.byTool = { Bash: 200, Read: 150 };

      const paths = await exportToCSV(testCache, {
        outputDir: testDir,
        prefix: 'test',
        includeTimestamp: false
      });

      const toolPath = paths.find(p => p.includes('tools'));
      const content = await readFile(toolPath, 'utf8');

      expect(content).toContain('Tool,Count,Percentage');
      expect(content).toContain('Bash,200');
    });

    test('should export time patterns to CSV', async () => {
      testCache.timePatterns.hourlyActivity = Array(24).fill(5);
      testCache.timePatterns.dailyActivity = Array(7).fill(10);

      const paths = await exportToCSV(testCache, {
        outputDir: testDir,
        prefix: 'test',
        includeTimestamp: false
      });

      const timePath = paths.find(p => p.includes('time'));
      const content = await readFile(timePath, 'utf8');

      expect(content).toContain('Hour,Activity Count');
      expect(content).toContain('Day,Activity Count');
    });

    test('should handle projects with commas in names', async () => {
      testCache.conversationStats = {
        avgMessagesPerConversation: 50,
        medianMessagesPerConversation: 45,
        byProject: {
          'Project, with commas': { count: 10, totalMessages: 500, avgMessages: 50 }
        }
      };

      const paths = await exportToCSV(testCache, {
        outputDir: testDir,
        prefix: 'test',
        includeTimestamp: false
      });

      const projectPath = paths.find(p => p.includes('projects'));
      const content = await readFile(projectPath, 'utf8');

      expect(content).toContain('"Project, with commas"'); // Should be quoted
    });
  });
});
