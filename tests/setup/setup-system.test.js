/**
 * Setup System Test Suite
 * Tests for setup manager, menu, bulk extraction, and index building
 */

import { jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import { 
  createTestEnv,
  MockInquirer,
  ConsoleCapture,
  delay,
  waitFor
} from '../utils/test-helpers.js';
import {
  createMockConversation,
  createMockConversationSet,
  createMockJsonlFile,
  createMockJsonlFiles,
  createMockConfig,
  createMockFileSystem
} from '../utils/mock-factories.js';
import { SAMPLE_CONVERSATIONS } from '../fixtures/conversation-fixtures.js';

// We'll mock these modules
let SetupManager;
let SetupMenu;
let BulkExtractor;
let IndexBuilder;

beforeAll(async () => {
  // Dynamic imports for the modules
  SetupManager = (await import('../../src/setup/setup-manager.js')).default;
  SetupMenu = (await import('../../src/setup/setup-menu.js')).default;
  BulkExtractor = (await import('../../src/setup/bulk-extractor.js')).default;
  IndexBuilder = (await import('../../src/setup/index-builder.js')).default;
});

describe('Setup System', () => {
  let testEnv;
  let consoleCapture;
  let mockInquirer;

  beforeEach(async () => {
    testEnv = await createTestEnv();
    consoleCapture = new ConsoleCapture();
    mockInquirer = new MockInquirer();
    
    // Set test environment paths
    process.env.TEST_HOME = testEnv.tempDir;
  });

  afterEach(async () => {
    consoleCapture.stop();
    await testEnv.cleanup();
    delete process.env.TEST_HOME;
  });

  describe('SetupManager', () => {
    let setupManager;

    beforeEach(() => {
      setupManager = new SetupManager({
        configDir: testEnv.conversationsDir,
        projectsDir: testEnv.projectsDir,
        logger: {
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          debug: jest.fn()
        }
      });
    });

    test('should initialize with default configuration', async () => {
      await setupManager.initialize();
      
      expect(setupManager.isSetupComplete()).toBe(false);
      expect(setupManager.getExportDirectory()).toBeDefined();
      expect(setupManager.getIndexPath()).toContain('search-index-v2.json');
    });

    test('should load existing configuration', async () => {
      // Create a fresh setup manager without calling initialize()
      const freshSetupManager = new SetupManager({
        configDir: testEnv.conversationsDir,
        projectsDir: testEnv.projectsDir,
        exportDir: testEnv.conversationsDir
      });
      
      const config = createMockConfig({
        exportDir: '/custom/export',
        setupComplete: true
      });
      await fs.writeJson(freshSetupManager.configPath, config);

      await freshSetupManager.loadConfig();
      
      expect(freshSetupManager.isSetupComplete()).toBe(true);
      expect(freshSetupManager.getExportDirectory()).toBe('/custom/export');
    });

    test('should save configuration changes', async () => {
      await setupManager.initialize();
      setupManager.setExportDirectory('/new/export/path');
      setupManager.setSetupComplete(true);
      
      await setupManager.saveConfig();
      
      const savedConfig = await fs.readJson(setupManager.configPath);
      expect(savedConfig.exportDirectory).toBe('/new/export/path');
      expect(savedConfig.setupComplete).toBe(true);
    });

    test('should track extraction status', async () => {
      await setupManager.initialize();
      
      const beforeTime = Date.now();
      await setupManager.markExtractionComplete();
      const afterTime = Date.now();
      
      const lastExtraction = new Date(setupManager.getLastExtraction()).getTime();
      expect(lastExtraction).toBeGreaterThanOrEqual(beforeTime);
      expect(lastExtraction).toBeLessThanOrEqual(afterTime);
    });

    test('should track index build status', async () => {
      await setupManager.initialize();
      
      await setupManager.markIndexBuildComplete();
      
      expect(setupManager.getLastIndexBuild()).toBeDefined();
      expect(setupManager.isIndexFresh()).toBe(true);
    });

    test('should detect stale index', async () => {
      await setupManager.initialize();
      
      // Set old index build time
      setupManager.config.lastIndexBuild = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      
      expect(setupManager.isIndexFresh()).toBe(false);
    });

    test('should handle missing config directory', async () => {
      const manager = new SetupManager({
        configDir: '/non/existent/path'
      });
      
      await manager.initialize();
      expect(manager.config).toBeDefined();
      expect(manager.isSetupComplete()).toBe(false);
    });

    test('should validate export directory', async () => {
      await setupManager.initialize();
      
      const validPath = testEnv.conversationsDir;
      const invalidPath = '/root/restricted';
      
      expect(await setupManager.validateExportDirectory(validPath)).toBe(true);
      expect(await setupManager.validateExportDirectory(invalidPath)).toBe(false);
    });

    test('should handle configuration migration', async () => {
      // Old config format
      const oldConfig = {
        exportPath: '/old/path',
        complete: true
      };
      await fs.writeJson(setupManager.configPath, oldConfig);
      
      await setupManager.loadConfig();
      
      // Should migrate to new format
      expect(setupManager.config.exportDirectory).toBeDefined();
      expect(setupManager.config.setupComplete).toBeDefined();
    });

    test('should provide setup statistics', async () => {
      await setupManager.initialize();
      
      // Create some test conversations
      const conversations = createMockConversationSet({ count: 5 });
      await createMockJsonlFiles(testEnv.projectsDir, conversations);
      
      const stats = await setupManager.getStatistics();
      
      expect(stats.conversationCount).toBeGreaterThanOrEqual(0);
      expect(stats.totalSize).toBeGreaterThanOrEqual(0);
      expect(stats.lastUpdate).toBeDefined();
    });
  });

  describe('BulkExtractor', () => {
    let bulkExtractor;

    beforeEach(() => {
      bulkExtractor = new BulkExtractor({
        projectsDir: testEnv.projectsDir,
        outputDir: testEnv.conversationsDir,
        logger: {
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          debug: jest.fn()
        }
      });
    });

    test('should extract conversations from JSONL files', async () => {
      // Create test JSONL files - 5 separate files for 5 conversations
      const conversations = createMockConversationSet({ count: 5 });
      await createMockJsonlFiles(testEnv.projectsDir, conversations);

      const results = await bulkExtractor.extractAll();
      
      expect(results.success).toBe(true);
      expect(results.extracted).toBe(5);
      expect(results.failed).toBe(0);
      
      // Check output files were created
      const outputFiles = await fs.readdir(testEnv.conversationsDir);
      expect(outputFiles.length).toBeGreaterThan(0);
    });

    test('should handle extraction with progress callback', async () => {
      const conversations = createMockConversationSet({ count: 10 });
      await createMockJsonlFiles(testEnv.projectsDir, conversations);

      const progressEvents = [];
      const onProgress = (event) => progressEvents.push(event);
      
      await bulkExtractor.extractAll({ onProgress });
      
      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents.some(e => e.type === 'start')).toBe(true);
      expect(progressEvents.some(e => e.type === 'complete')).toBe(true);
    });

    test('should skip already extracted conversations', async () => {
      const conversations = createMockConversationSet({ count: 3 });
      await createMockJsonlFiles(testEnv.projectsDir, conversations);

      // First extraction
      const result1 = await bulkExtractor.extractAll();
      expect(result1.extracted).toBe(3);

      // Second extraction should skip
      const result2 = await bulkExtractor.extractAll();
      expect(result2.skipped).toBe(3);
      expect(result2.extracted).toBe(0);
    });

    test('should handle corrupted JSONL gracefully', async () => {
      // Create JSONL with valid and invalid lines
      const validLine1 = JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: 'Test message 1'
        },
        isMeta: false
      });
      
      const validLine2 = JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: 'Test response 1'
        },
        isMeta: false
      });
      
      const content = [
        validLine1,
        'invalid json line',
        validLine2,
        '{ broken json',
        'another invalid line'
      ].join('\n');
      
      await fs.writeFile(
        path.join(testEnv.projectsDir, 'corrupted.jsonl'),
        content
      );

      const results = await bulkExtractor.extractAll();
      
      expect(results.extracted).toBe(1); // One file with valid content
      expect(results.failed).toBe(0); // Files with recoverable errors don't fail completely
      expect(results.total).toBe(1);
    });

    test('should support different export formats', async () => {
      await createMockJsonlFile(
        path.join(testEnv.projectsDir, 'test.jsonl'),
        SAMPLE_CONVERSATIONS.simple
      );

      // Test markdown export
      await bulkExtractor.extractAll({ format: 'markdown' });
      const mdFiles = (await fs.readdir(testEnv.conversationsDir))
        .filter(f => f.endsWith('.md'));
      expect(mdFiles.length).toBeGreaterThan(0);

      // Test JSON export
      await bulkExtractor.extractAll({ format: 'json' });
      const jsonFiles = (await fs.readdir(testEnv.conversationsDir))
        .filter(f => f.endsWith('.json'));
      expect(jsonFiles.length).toBeGreaterThan(0);
    });

    test('should handle large datasets with batching', async () => {
      const largeSet = createMockConversationSet({ count: 100 });
      await createMockJsonlFiles(testEnv.projectsDir, largeSet);

      const startTime = Date.now();
      const results = await bulkExtractor.extractAll({ batchSize: 10 });
      const duration = Date.now() - startTime;

      expect(results.extracted).toBe(100);
      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
    });

    test('should support filtering options', async () => {
      const conversations = createMockConversationSet({ count: 10 });
      await createMockJsonlFiles(testEnv.projectsDir, conversations);

      const results = await bulkExtractor.extractAll({
        filter: {
          afterDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          minMessages: 3
        }
      });

      expect(results.extracted).toBeLessThanOrEqual(10);
    });
  });

  describe('IndexBuilder', () => {
    let indexBuilder;

    beforeEach(() => {
      indexBuilder = new IndexBuilder({
        projectsDir: testEnv.projectsDir,
        indexPath: path.join(testEnv.conversationsDir, 'search-index-v2.json'),
        logger: {
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          debug: jest.fn()
        }
      });
    });

    test('should build search index from conversations', async () => {
      const conversations = createMockConversationSet({ count: 5 });
      await createMockJsonlFiles(testEnv.projectsDir, conversations);

      const result = await indexBuilder.build();
      
      expect(result.success).toBe(true);
      expect(result.documentCount).toBeGreaterThan(0);
      expect(result.conversationCount).toBe(5);
      
      // Check index file was created
      const indexExists = await fs.exists(indexBuilder.indexPath);
      expect(indexExists).toBe(true);
    });

    test('should optimize index for search performance', async () => {
      const conversations = createMockConversationSet({ count: 20 });
      await createMockJsonlFiles(testEnv.projectsDir, conversations);

      await indexBuilder.build();
      
      const indexData = await fs.readJson(indexBuilder.indexPath);
      expect(indexData.version).toBeDefined();
      expect(indexData.stats).toBeDefined();
      expect(indexData.stats.documentCount).toBeGreaterThanOrEqual(0);
    });

    // Removed: "should handle incremental updates" test
    // This test is obsolete after architecture change from JSONL to markdown indexing.
    // With markdown-based indexing, we rebuild the full index from all markdown files
    // rather than doing incremental updates. This is fast enough (~30s for 500 files)
    // and simpler than maintaining incremental update logic.

    test('should validate index integrity', async () => {
      const conversations = createMockConversationSet({ count: 5 });
      await createMockJsonlFiles(testEnv.projectsDir, conversations);

      await indexBuilder.build();
      
      // Check that index file exists
      const indexExists = await fs.exists(indexBuilder.indexPath);
      expect(indexExists).toBe(true);
      
      const isValid = await indexBuilder.validateIndex();
      expect(isValid).toBe(true);

      // Corrupt the index
      const indexData = await fs.readJson(indexBuilder.indexPath);
      delete indexData.version;
      await fs.writeJson(indexBuilder.indexPath, indexData);

      const isValidAfterCorruption = await indexBuilder.validateIndex();
      expect(isValidAfterCorruption).toBe(false);
    });

    test('should provide build statistics', async () => {
      const conversations = createMockConversationSet({ count: 10 });
      await createMockJsonlFiles(testEnv.projectsDir, conversations);

      const result = await indexBuilder.build();
      
      expect(result.stats).toBeDefined();
      expect(result.stats.buildTime).toBeGreaterThan(0);
      expect(result.stats.indexSize).toBeGreaterThan(0);
      expect(result.stats.avgDocumentSize).toBeGreaterThan(0);
    });

    test('should handle empty project directory', async () => {
      const result = await indexBuilder.build();
      
      expect(result.success).toBe(true);
      expect(result.documentCount).toBe(0);
      expect(result.conversationCount).toBe(0);
    });

    test('should support custom indexing options', async () => {
      const conversations = createMockConversationSet({ count: 5 });
      await createMockJsonlFiles(testEnv.projectsDir, conversations);

      const result = await indexBuilder.build({
        fields: ['content', 'conversationName'],
        storeFields: ['timestamp', 'role'],
        fuzzyMatch: 0.8
      });

      expect(result.success).toBe(true);
      const indexData = await fs.readJson(indexBuilder.indexPath);
      expect(indexData.config).toBeDefined();
      expect(indexData.config.fuzzyMatch).toBe(0.8);
    });
  });

  describe('SetupMenu', () => {
    let setupMenu;
    let setupManager;

    beforeEach(async () => {
      setupManager = new SetupManager({
        configDir: testEnv.conversationsDir,
        projectsDir: testEnv.projectsDir,
        exportDir: testEnv.conversationsDir
      });
      await setupManager.initialize();

      setupMenu = new SetupMenu({
        setupManager,
        inquirer: mockInquirer,
        logger: {
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          debug: jest.fn()
        }
      });
    });

    test('should display main menu options', async () => {
      mockInquirer.setResponse('choice', 'exit');
      
      await setupMenu.show();
      
      const prompts = mockInquirer.getPrompts();
      expect(prompts.length).toBeGreaterThan(0);
      expect(prompts[0].choices).toBeDefined();
    });

    test('should handle initial setup flow', async () => {
      mockInquirer.setResponses({
        action: 'setup',
        exportDirectory: testEnv.conversationsDir,
        extractNow: true,
        buildIndex: true
      });

      const result = await setupMenu.runInitialSetup();
      
      expect(result.success).toBe(true);
      expect(setupManager.isSetupComplete()).toBe(true);
    });

    test('should handle extraction menu option', async () => {
      const conversations = createMockConversationSet({ count: 3 });
      await createMockJsonlFiles(testEnv.projectsDir, conversations);

      mockInquirer.setResponses({
        action: 'extract',
        format: 'markdown',
        confirm: true
      });

      const result = await setupMenu.runExtraction();
      
      expect(result.extracted).toBeGreaterThan(0);
    });

    test('should handle index building menu option', async () => {
      const conversations = createMockConversationSet({ count: 3 });
      await createMockJsonlFiles(testEnv.projectsDir, conversations);

      mockInquirer.setResponses({
        action: 'buildIndex',
        confirm: true
      });

      const result = await setupMenu.runIndexBuild();
      
      expect(result.success).toBe(true);
      expect(result.documentCount).toBeGreaterThan(0);
    });

    test('should show setup statistics', async () => {
      const conversations = createMockConversationSet({ count: 5 });
      await createMockJsonlFiles(testEnv.projectsDir, conversations);

      mockInquirer.setResponse('continue', '');

      consoleCapture.start();
      await setupMenu.showStatistics();
      consoleCapture.stop();

      const logs = consoleCapture.getLogs();
      expect(logs.some(log => log.includes('Conversations'))).toBe(true);
    });

    test('should validate user input', async () => {
      mockInquirer.setResponses({
        exportDirectory: '/invalid/\0path',
        confirm: false
      });

      const result = await setupMenu.getExportDirectory();
      
      expect(result).toBeNull();
    });

    test('should handle configuration changes', async () => {
      mockInquirer.setResponses({
        action: 'configure',
        setting: 'exportDirectory',
        value: '/new/path',
        confirm: true
      });

      await setupMenu.configureSettings();
      
      expect(setupManager.getExportDirectory()).toBe('/new/path');
    });
  });

  describe('Integration Tests', () => {
    test('should complete full setup workflow', async () => {
      // Create test data
      await createMockFileSystem(testEnv.tempDir);

      // Initialize setup manager
      const setupManager = new SetupManager({
        configDir: testEnv.conversationsDir,
        projectsDir: testEnv.projectsDir
      });
      await setupManager.initialize();

      // Run extraction
      const extractor = new BulkExtractor({
        projectsDir: testEnv.projectsDir,
        outputDir: testEnv.conversationsDir
      });
      const extractResult = await extractor.extractAll();
      expect(extractResult.success).toBe(true);

      // Build index
      const indexBuilder = new IndexBuilder({
        projectsDir: testEnv.projectsDir,
        indexPath: path.join(testEnv.conversationsDir, 'search-index-v2.json')
      });
      const indexResult = await indexBuilder.build();
      expect(indexResult.success).toBe(true);

      // Mark index build complete
      await setupManager.markIndexBuildComplete(indexResult.documentCount);

      // Mark setup complete
      setupManager.setSetupComplete(true);
      await setupManager.saveConfig();

      // Verify everything is ready
      expect(setupManager.isSetupComplete()).toBe(true);
      expect(setupManager.isIndexFresh()).toBe(true);
      
      const indexExists = await fs.exists(
        path.join(testEnv.conversationsDir, 'search-index-v2.json')
      );
      expect(indexExists).toBe(true);
    });

    test('should handle setup recovery after failure', async () => {
      const setupManager = new SetupManager({
        configDir: testEnv.conversationsDir,
        projectsDir: testEnv.projectsDir
      });

      // Simulate partial setup
      await setupManager.initialize();
      setupManager.config.lastExtraction = new Date().toISOString();
      setupManager.config.lastIndexBuild = null; // Index build failed
      await setupManager.saveConfig();

      // Recovery should detect incomplete setup
      expect(setupManager.isSetupComplete()).toBe(false);
      expect(setupManager.needsIndexRebuild()).toBe(true);
    });
  });
});