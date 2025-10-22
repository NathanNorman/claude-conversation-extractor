/**
 * Tests for AnalyticsManager
 */

import { jest } from '@jest/globals';
import { AnalyticsManager } from '../../src/analytics/analytics-manager.js';
import { createEmptyCache, validateCache } from '../../src/analytics/cache/schema.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('AnalyticsManager', () => {
  let testDir;
  let manager;

  beforeEach(async () => {
    // Create unique test directory for each test
    testDir = join(tmpdir(), `analytics-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });

    manager = new AnalyticsManager({
      cacheDir: testDir,
      projectsDir: join(testDir, 'projects')
    });
  });

  afterEach(async () => {
    // Clean up test directory
    await rm(testDir, { recursive: true, force: true });
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      await manager.initialize();
      expect(manager.cache).toBeDefined();
      expect(manager.cache.version).toBe(3); // Updated to v3 for turn-based counting
    });

    test('should create cache directory if missing', async () => {
      await manager.initialize();
      const cache = await manager.loadCache();
      expect(cache).toBeDefined();
    });

    test('should load empty cache when no cache file exists', async () => {
      await manager.initialize();
      expect(manager.cache.overview.totalConversations).toBe(0);
    });
  });

  describe('Cache Operations', () => {
    test('should save and load cache correctly', async () => {
      await manager.initialize();
      manager.cache.overview.totalConversations = 42;
      await manager.saveCache();

      const manager2 = new AnalyticsManager({
        cacheDir: testDir,
        projectsDir: join(testDir, 'projects')
      });
      await manager2.initialize();
      expect(manager2.cache.overview.totalConversations).toBe(42);
    });

    test('should validate cache on load', async () => {
      await manager.initialize();

      // Write invalid cache
      const invalidCache = { invalid: 'data' };
      await writeFile(manager.cachePath, JSON.stringify(invalidCache), 'utf8');

      const manager2 = new AnalyticsManager({
        cacheDir: testDir,
        projectsDir: join(testDir, 'projects')
      });
      await manager2.initialize();

      // Should create new cache instead of loading invalid one
      expect(manager2.cache.version).toBe(3); // Updated to v3 for turn-based counting
      expect(manager2.cache.overview).toBeDefined();
    });

    test('should update lastUpdated timestamp on save', async () => {
      await manager.initialize();
      const before = new Date();
      await new Promise(resolve => setTimeout(resolve, 10));
      await manager.saveCache();
      const after = new Date();

      const lastUpdated = new Date(manager.cache.lastUpdated);
      expect(lastUpdated.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(lastUpdated.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('Cache Validation', () => {
    test('should detect when cache needs rebuild', async () => {
      await manager.initialize();
      const needsRebuild = await manager.needsRebuild();
      expect(needsRebuild).toBe(true); // No lastAnalyzedTimestamp yet
    });

    test('should check cache existence', async () => {
      await manager.initialize();
      const exists = await manager.cacheExists();
      expect(exists).toBe(false); // No cache file yet

      await manager.saveCache();
      const existsAfterSave = await manager.cacheExists();
      expect(existsAfterSave).toBe(true);
    });
  });

  describe('Quick Stats', () => {
    test('should return quick stats', async () => {
      await manager.initialize();
      const stats = manager.getQuickStats();

      expect(stats).toHaveProperty('totalConversations');
      expect(stats).toHaveProperty('totalMessages');
      expect(stats).toHaveProperty('streaks');
      expect(stats).toHaveProperty('mostUsedTool');
      expect(stats).toHaveProperty('lastActivity');
    });

    test('should get most used tool', async () => {
      await manager.initialize();
      manager.cache.toolUsage = {
        byTool: {
          'Bash': 100,
          'Read': 50,
          'Edit': 75
        }
      };

      const mostUsed = manager.getMostUsedTool(manager.cache);
      expect(mostUsed).toBe('Bash');
    });

    test('should handle empty tool usage', async () => {
      await manager.initialize();
      manager.cache.toolUsage = { byTool: {} };

      const mostUsed = manager.getMostUsedTool(manager.cache);
      expect(mostUsed).toBe(null);
    });
  });

  describe('Search Recording', () => {
    test('should record search operations', async () => {
      await manager.initialize();

      await manager.recordSearch({
        time: 20,
        query: 'test',
        resultCount: 5
      });

      expect(manager.cache.searchPatterns.totalSearches).toBe(1);
      expect(manager.cache.searchPatterns.avgSearchTime).toBe(20);

      await manager.recordSearch({
        time: 30,
        query: 'another',
        resultCount: 10
      });

      expect(manager.cache.searchPatterns.totalSearches).toBe(2);
      expect(manager.cache.searchPatterns.avgSearchTime).toBe(25);
    });
  });

  describe('Force Refresh', () => {
    test('should reset cache on force refresh', async () => {
      await manager.initialize();
      manager.cache.overview.totalConversations = 99;
      await manager.saveCache();

      await manager.forceRefresh();
      expect(manager.cache.overview.totalConversations).toBe(0);
    });
  });
});
