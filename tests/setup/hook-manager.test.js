/**
 * Tests for HookManager - Auto-Export Hook Installation
 */

import { jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import { HookManager } from '../../src/setup/hook-manager.js';
import { createTestEnv } from '../utils/test-helpers.js';

describe('HookManager', () => {
  let testEnv;
  let hookManager;
  let mockSettingsPath;

  beforeEach(async () => {
    testEnv = await createTestEnv();
    mockSettingsPath = path.join(testEnv.tempDir, 'settings.json');
    hookManager = new HookManager({ settingsPath: mockSettingsPath });
  });

  afterEach(async () => {
    await testEnv.cleanup();
  });

  describe('Hook Installation', () => {
    test('should install hook to settings.json', async () => {
      const result = await hookManager.installHook();

      expect(result.success).toBe(true);
      expect(result.message).toContain('installed successfully');

      // Verify settings file was created
      expect(fs.existsSync(mockSettingsPath)).toBe(true);

      // Verify hook is in settings
      const settings = await fs.readJson(mockSettingsPath);
      expect(settings.hooks).toBeDefined();
      expect(settings.hooks.SessionEnd).toBeDefined();
      expect(settings.hooks.SessionEnd.length).toBeGreaterThan(0);
    });

    test('should not duplicate hook if already installed', async () => {
      await hookManager.installHook();
      const result = await hookManager.installHook();

      expect(result.success).toBe(true);
      expect(result.message).toContain('already installed');

      // Verify only one hook instance
      const settings = await fs.readJson(mockSettingsPath);
      const hookCount = settings.hooks.SessionEnd.filter(group =>
        group.hooks?.some(h => h.command?.includes('auto-export-conversation'))
      ).length;
      expect(hookCount).toBe(1);
    });

    test('should use absolute path for global install', async () => {
      const result = await hookManager.installHook();
      const command = hookManager.getHookCommand();

      expect(command).toContain('/node_modules/claude-conversation-extractor/');
      expect(command).toContain('auto-export-conversation.js');
    });
  });

  describe('Hook Uninstallation', () => {
    test('should remove hook from settings.json', async () => {
      await hookManager.installHook();
      const result = await hookManager.uninstallHook();

      expect(result.success).toBe(true);
      expect(result.message).toContain('uninstalled successfully');

      // Verify hook is removed
      const settings = await fs.readJson(mockSettingsPath);
      const hasHook = settings.hooks?.SessionEnd?.some(group =>
        group.hooks?.some(h => h.command?.includes('auto-export-conversation'))
      ) || false;
      expect(hasHook).toBe(false);
    });

    test('should handle uninstall when not installed', async () => {
      const result = await hookManager.uninstallHook();

      expect(result.success).toBe(true);
      expect(result.message).toContain('not installed');
    });

    test('should clean up empty hooks object', async () => {
      await hookManager.installHook();
      await hookManager.uninstallHook();

      const settings = await fs.readJson(mockSettingsPath);
      // SessionEnd should be removed or empty
      expect(settings.hooks?.SessionEnd?.length || 0).toBe(0);
    });
  });

  describe('Hook Status', () => {
    test('should detect hook installation status', async () => {
      let status = await hookManager.getHookStatus();
      expect(status.installed).toBe(false);

      await hookManager.installHook();

      status = await hookManager.getHookStatus();
      expect(status.installed).toBe(true);
    });

    test('should return hook configuration', async () => {
      await hookManager.installHook();
      const status = await hookManager.getHookStatus();

      expect(status.hookCommand).toBeDefined();
      expect(status.settingsPath).toBe(mockSettingsPath);
    });
  });

  describe('Settings.json Management', () => {
    test('should create settings.json if it does not exist', async () => {
      expect(fs.existsSync(mockSettingsPath)).toBe(false);

      await hookManager.installHook();

      expect(fs.existsSync(mockSettingsPath)).toBe(true);
    });

    test('should preserve existing settings when installing', async () => {
      // Create settings with existing content
      await fs.writeJson(mockSettingsPath, {
        someOtherSetting: 'value',
        hooks: {
          PreToolUse: [{ hooks: [{ type: 'command', command: 'echo test' }] }]
        }
      });

      await hookManager.installHook();

      const settings = await fs.readJson(mockSettingsPath);
      expect(settings.someOtherSetting).toBe('value');
      expect(settings.hooks.PreToolUse).toBeDefined();
      expect(settings.hooks.SessionEnd).toBeDefined();
    });

    test('should handle corrupted settings.json gracefully', async () => {
      await fs.writeFile(mockSettingsPath, 'invalid json{{{');

      const result = await hookManager.installHook();

      // Should fail gracefully
      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed');
    });
  });
});
