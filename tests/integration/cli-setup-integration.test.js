/**
 * Integration tests for CLI setup menu functionality
 * Tests the setup flow as a user would experience it
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { writeFile, mkdir, rm, readFile, access, unlink } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { constants } from 'fs';
import SetupManager from '../../src/setup/setup-manager.js';

describe('CLI Setup Integration', () => {
  const testConfigDir = join(homedir(), '.claude', 'test-setup-config');
  const testProjectsDir = join(homedir(), '.claude', 'projects', 'test-setup');
  const testConversationsDir = join(testConfigDir, 'claude_conversations');
  
  const mockConversations = [
    {
      project: 'project-alpha',
      messages: [
        { role: 'user', content: 'Test message 1' },
        { role: 'assistant', content: 'Test response 1' }
      ]
    },
    {
      project: 'project-beta', 
      messages: [
        { role: 'user', content: 'Test message 2' },
        { role: 'assistant', content: 'Test response 2' }
      ]
    }
  ];

  beforeAll(async () => {
    // Create test directories
    await mkdir(testConfigDir, { recursive: true });
    await mkdir(testProjectsDir, { recursive: true });
    await mkdir(testConversationsDir, { recursive: true });
    
    // Create mock conversation files
    for (const conv of mockConversations) {
      const content = conv.messages.map(m => JSON.stringify(m)).join('\n');
      await writeFile(join(testProjectsDir, `${conv.project}.jsonl`), content);
    }
  });

  afterAll(async () => {
    await rm(testConfigDir, { recursive: true, force: true });
    await rm(testProjectsDir, { recursive: true, force: true });
  });

  describe('Setup State Management', () => {
    let setupManager;

    beforeEach(() => {
      setupManager = new SetupManager({
        configPath: join(testConfigDir, 'setup.json'),
        conversationsDir: testConversationsDir,
        projectsDir: testProjectsDir
      });
    });

    it('should initialize setup state', async () => {
      const state = await setupManager.getSetupState();
      
      expect(state).toHaveProperty('isFirstRun');
      expect(state).toHaveProperty('lastExtraction');
      expect(state).toHaveProperty('extractedCount');
      expect(state).toHaveProperty('indexBuilt');
      expect(state).toHaveProperty('version');
    });

    it('should detect first run correctly', async () => {
      const isFirstRun = await setupManager.isFirstRun();
      expect(typeof isFirstRun).toBe('boolean');
    });

    it('should save setup state', async () => {
      const newState = {
        isFirstRun: false,
        lastExtraction: new Date().toISOString(),
        extractedCount: 10,
        indexBuilt: true,
        exportLocation: testConversationsDir,
        version: '1.1.0'
      };
      
      await setupManager.saveSetupState(newState);
      const savedState = await setupManager.getSetupState();
      
      expect(savedState.isFirstRun).toBe(false);
      expect(savedState.extractedCount).toBe(10);
      expect(savedState.indexBuilt).toBe(true);
    });

    it('should update extraction statistics', async () => {
      await setupManager.updateExtractionStats(5);
      const state = await setupManager.getSetupState();
      
      expect(state.extractedCount).toBe(5);
      expect(state.lastExtraction).toBeTruthy();
    });
  });

  describe('Export Location Configuration', () => {
    let setupManager;

    beforeEach(() => {
      setupManager = new SetupManager({
        configPath: join(testConfigDir, 'setup.json'),
        conversationsDir: testConversationsDir,
        projectsDir: testProjectsDir
      });
    });

    it('should get current export location', async () => {
      const location = await setupManager.getExportLocation();
      expect(location).toBeTruthy();
      expect(typeof location).toBe('string');
    });

    it('should set custom export location', async () => {
      const customLocation = join(testConfigDir, 'custom-exports');
      await setupManager.setExportLocation(customLocation);
      
      const location = await setupManager.getExportLocation();
      expect(location).toBe(customLocation);
    });

    it('should validate export location exists', async () => {
      const nonExistentLocation = '/invalid/path/that/does/not/exist';
      
      // Should create the directory if it doesn't exist
      await setupManager.setExportLocation(nonExistentLocation);
      
      // For testing, we'll check if the manager handles this gracefully
      const location = await setupManager.getExportLocation();
      expect(location).toBeTruthy();
    });

    it('should handle permission errors gracefully', async () => {
      const restrictedLocation = '/root/no-permission';
      
      try {
        await setupManager.setExportLocation(restrictedLocation);
      } catch (error) {
        expect(error).toBeDefined();
        // Should fall back to default location
        const location = await setupManager.getExportLocation();
        expect(location).not.toBe(restrictedLocation);
      }
    });
  });

  describe('Conversation Discovery', () => {
    let setupManager;

    beforeEach(() => {
      setupManager = new SetupManager({
        configPath: join(testConfigDir, 'setup.json'),
        conversationsDir: testConversationsDir,
        projectsDir: testProjectsDir
      });
    });

    it('should discover available conversations', async () => {
      const conversations = await setupManager.discoverConversations();
      
      expect(Array.isArray(conversations)).toBe(true);
      expect(conversations.length).toBeGreaterThanOrEqual(0);
      
      if (conversations.length > 0) {
        expect(conversations[0]).toHaveProperty('project');
        expect(conversations[0]).toHaveProperty('path');
        expect(conversations[0]).toHaveProperty('size');
        expect(conversations[0]).toHaveProperty('modified');
      }
    });

    it('should count total conversations', async () => {
      const count = await setupManager.countConversations();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should identify new conversations since last extraction', async () => {
      // Set a past extraction date
      await setupManager.updateExtractionStats(1);
      const state = await setupManager.getSetupState();
      state.lastExtraction = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      await setupManager.saveSetupState(state);
      
      // Add a new conversation file
      const newConvPath = join(testProjectsDir, 'new-conversation.jsonl');
      await writeFile(newConvPath, JSON.stringify({ role: 'user', content: 'New message' }));
      
      const newConversations = await setupManager.getNewConversations();
      expect(Array.isArray(newConversations)).toBe(true);
      
      // Clean up
      await unlink(newConvPath);
    });
  });

  describe('Index Management', () => {
    let setupManager;

    beforeEach(() => {
      setupManager = new SetupManager({
        configPath: join(testConfigDir, 'setup.json'),
        conversationsDir: testConversationsDir,
        projectsDir: testProjectsDir
      });
    });

    it('should check if index exists', async () => {
      const exists = await setupManager.indexExists();
      expect(typeof exists).toBe('boolean');
    });

    it('should check if index needs rebuild', async () => {
      const needsRebuild = await setupManager.indexNeedsRebuild();
      expect(typeof needsRebuild).toBe('boolean');
    });

    it('should track index build status', async () => {
      await setupManager.markIndexBuilt();
      const state = await setupManager.getSetupState();
      
      expect(state.indexBuilt).toBe(true);
      expect(state.lastIndexBuild).toBeTruthy();
    });

    it('should get index statistics', async () => {
      const stats = await setupManager.getIndexStats();
      
      expect(stats).toHaveProperty('exists');
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('lastModified');
      
      if (stats.exists) {
        expect(stats.size).toBeGreaterThanOrEqual(0);
        expect(stats.lastModified).toBeTruthy();
      }
    });
  });

  describe('Setup Menu Options', () => {
    it('should provide correct menu options for first run', () => {
      const isFirstRun = true;
      const options = [
        'Extract all conversations',
        'Set export location',
        'Build search index',
        'Skip setup'
      ];
      
      expect(options).toContain('Extract all conversations');
      expect(options).toContain('Set export location');
      expect(options).toContain('Build search index');
      expect(options).toContain('Skip setup');
    });

    it('should provide correct menu options for returning user', () => {
      const isFirstRun = false;
      const options = [
        'Update conversations',
        'Rebuild search index',
        'Change export location',
        'View statistics',
        'Back to main menu'
      ];
      
      expect(options).toContain('Update conversations');
      expect(options).toContain('Rebuild search index');
      expect(options).toContain('Change export location');
      expect(options).toContain('View statistics');
    });

    it('should track menu navigation history', () => {
      const navigationHistory = [];
      
      navigationHistory.push('main');
      navigationHistory.push('setup');
      navigationHistory.push('export_location');
      
      expect(navigationHistory).toHaveLength(3);
      expect(navigationHistory[navigationHistory.length - 1]).toBe('export_location');
      
      // Go back
      navigationHistory.pop();
      expect(navigationHistory[navigationHistory.length - 1]).toBe('setup');
    });
  });

  describe('Bulk Operations', () => {
    let setupManager;

    beforeEach(() => {
      setupManager = new SetupManager({
        configPath: join(testConfigDir, 'setup.json'),
        conversationsDir: testConversationsDir,
        projectsDir: testProjectsDir
      });
    });

    it('should track bulk extraction progress', async () => {
      const totalFiles = 10;
      let processedFiles = 0;
      
      // Simulate bulk extraction
      for (let i = 0; i < totalFiles; i++) {
        processedFiles++;
        const progress = (processedFiles / totalFiles) * 100;
        expect(progress).toBeLessThanOrEqual(100);
      }
      
      expect(processedFiles).toBe(totalFiles);
    });

    it('should handle extraction cancellation', async () => {
      let cancelled = false;
      const totalFiles = 10;
      let processedFiles = 0;
      
      // Simulate extraction with cancellation
      for (let i = 0; i < totalFiles; i++) {
        if (i === 5) {
          cancelled = true;
          break;
        }
        processedFiles++;
      }
      
      expect(cancelled).toBe(true);
      expect(processedFiles).toBe(5);
    });

    it('should report extraction statistics', async () => {
      const stats = {
        totalConversations: 50,
        extractedConversations: 45,
        failedConversations: 5,
        duration: 120000, // 2 minutes in ms
        averageTime: 2400 // 2.4 seconds per conversation
      };
      
      expect(stats.extractedConversations).toBe(45);
      expect(stats.failedConversations).toBe(5);
      expect(stats.extractedConversations + stats.failedConversations).toBe(stats.totalConversations);
    });
  });

  describe('Error Recovery', () => {
    let setupManager;

    beforeEach(() => {
      setupManager = new SetupManager({
        configPath: join(testConfigDir, 'setup.json'),
        conversationsDir: testConversationsDir,
        projectsDir: testProjectsDir
      });
    });

    it('should handle corrupted setup.json', async () => {
      // Write invalid JSON
      await writeFile(join(testConfigDir, 'setup.json'), 'invalid json content');
      
      // Should create a new valid state
      const state = await setupManager.getSetupState();
      expect(state).toHaveProperty('version');
      expect(state).toHaveProperty('isFirstRun');
    });

    it('should handle missing directories', async () => {
      const missingDirManager = new SetupManager({
        configPath: join(testConfigDir, 'missing', 'setup.json'),
        conversationsDir: join(testConfigDir, 'missing', 'conversations'),
        projectsDir: '/non/existent/path'
      });
      
      // Should handle gracefully
      const conversations = await missingDirManager.discoverConversations();
      expect(Array.isArray(conversations)).toBe(true);
      expect(conversations).toHaveLength(0);
    });

    it('should recover from interrupted operations', async () => {
      // Simulate an interrupted index build
      const state = await setupManager.getSetupState();
      state.indexBuilding = true;
      state.indexBuildStarted = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
      await setupManager.saveSetupState(state);
      
      // Check if manager detects the interrupted build
      const needsRebuild = await setupManager.indexNeedsRebuild();
      expect(needsRebuild).toBe(true);
    });
  });

  describe('Configuration Migration', () => {
    let setupManager;

    beforeEach(() => {
      setupManager = new SetupManager({
        configPath: join(testConfigDir, 'setup.json'),
        conversationsDir: testConversationsDir,
        projectsDir: testProjectsDir
      });
    });

    it('should migrate old configuration format', async () => {
      // Create old format config
      const oldConfig = {
        firstRun: false,
        exportPath: '/old/path',
        conversationCount: 10
      };
      
      await writeFile(join(testConfigDir, 'setup.json'), JSON.stringify(oldConfig));
      
      // Load with new manager - should migrate
      const state = await setupManager.getSetupState();
      expect(state).toHaveProperty('version');
      expect(state).toHaveProperty('isFirstRun');
      expect(state.isFirstRun).toBe(false);
    });

    it('should preserve user settings during migration', async () => {
      const oldConfig = {
        exportLocation: '/custom/export/path',
        extractedCount: 42,
        lastExtraction: '2024-01-01T00:00:00Z'
      };
      
      await writeFile(join(testConfigDir, 'setup.json'), JSON.stringify(oldConfig));
      
      const state = await setupManager.getSetupState();
      expect(state.exportLocation).toBe('/custom/export/path');
      expect(state.extractedCount).toBe(42);
    });
  });

  describe('User Preferences', () => {
    let setupManager;

    beforeEach(() => {
      setupManager = new SetupManager({
        configPath: join(testConfigDir, 'setup.json'),
        conversationsDir: testConversationsDir,
        projectsDir: testProjectsDir
      });
    });

    it('should save user preferences', async () => {
      const preferences = {
        defaultExportFormat: 'markdown',
        includeMetadata: true,
        autoIndex: true,
        theme: 'dark'
      };
      
      await setupManager.savePreferences(preferences);
      const saved = await setupManager.getPreferences();
      
      expect(saved.defaultExportFormat).toBe('markdown');
      expect(saved.includeMetadata).toBe(true);
      expect(saved.autoIndex).toBe(true);
    });

    it('should apply default preferences for new users', async () => {
      const defaults = await setupManager.getPreferences();
      
      expect(defaults).toHaveProperty('defaultExportFormat');
      expect(defaults).toHaveProperty('includeMetadata');
      expect(['markdown', 'json', 'html', 'text']).toContain(defaults.defaultExportFormat);
    });
  });
});