/**
 * Tests for CommandManager - /remember Slash Command Installation
 */

import { jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import { CommandManager } from '../../src/setup/command-manager.js';
import { createTestEnv } from '../utils/test-helpers.js';

describe('CommandManager', () => {
  let testEnv;
  let commandManager;
  let mockSettingsPath;

  beforeEach(async () => {
    testEnv = await createTestEnv();
    mockSettingsPath = path.join(testEnv.tempDir, 'settings.json');
    commandManager = new CommandManager({ settingsPath: mockSettingsPath });
  });

  afterEach(async () => {
    await testEnv.cleanup();
  });

  describe('/remember Command Installation', () => {
    test('should install /remember command to settings.json', async () => {
      const result = await commandManager.installRememberCommand();

      expect(result.success).toBe(true);
      expect(result.message).toContain('installed successfully');

      // Verify settings file was created
      expect(fs.existsSync(mockSettingsPath)).toBe(true);

      // Verify command is in settings
      const settings = await fs.readJson(mockSettingsPath);
      expect(settings.slashCommands).toBeDefined();
      expect(settings.slashCommands.remember).toBeDefined();
      expect(settings.slashCommands.remember.command).toContain('remember.js');
      expect(settings.slashCommands.remember.description).toBeDefined();
      expect(settings.slashCommands.remember.timeout).toBe(30);
    });

    test('should not duplicate command if already installed', async () => {
      await commandManager.installRememberCommand();
      const result = await commandManager.installRememberCommand();

      expect(result.success).toBe(true);
      expect(result.message).toContain('already installed');
    });

    test('should use absolute path for global install', async () => {
      await commandManager.installRememberCommand();
      const scriptPath = commandManager.getRememberScriptPath();

      expect(scriptPath).toContain('/node_modules/claude-conversation-extractor/');
      expect(scriptPath).toContain('remember.js');
    });
  });

  describe('/remember Command Uninstallation', () => {
    test('should remove command from settings.json', async () => {
      await commandManager.installRememberCommand();
      const result = await commandManager.uninstallRememberCommand();

      expect(result.success).toBe(true);
      expect(result.message).toContain('uninstalled successfully');

      // Verify command is removed
      const settings = await fs.readJson(mockSettingsPath);
      expect(settings.slashCommands?.remember).toBeUndefined();
    });

    test('should handle uninstall when not installed', async () => {
      const result = await commandManager.uninstallRememberCommand();

      expect(result.success).toBe(true);
      expect(result.message).toContain('not installed');
    });

    test('should clean up empty slashCommands object', async () => {
      await commandManager.installRememberCommand();
      await commandManager.uninstallRememberCommand();

      const settings = await fs.readJson(mockSettingsPath);
      expect(settings.slashCommands).toBeUndefined();
    });
  });

  describe('Command Status', () => {
    test('should detect command installation status', async () => {
      let status = await commandManager.getCommandStatus();
      expect(status.installed).toBe(false);

      await commandManager.installRememberCommand();

      status = await commandManager.getCommandStatus();
      expect(status.installed).toBe(true);
    });

    test('should return command configuration', async () => {
      await commandManager.installRememberCommand();
      const status = await commandManager.getCommandStatus();

      expect(status.scriptPath).toBeDefined();
      expect(status.settingsPath).toBe(mockSettingsPath);
    });
  });

  describe('Settings.json Management', () => {
    test('should create settings.json if it does not exist', async () => {
      expect(fs.existsSync(mockSettingsPath)).toBe(false);

      await commandManager.installRememberCommand();

      expect(fs.existsSync(mockSettingsPath)).toBe(true);
    });

    test('should preserve existing settings when installing', async () => {
      await fs.writeJson(mockSettingsPath, {
        someOtherSetting: 'value',
        slashCommands: {
          existingCommand: { command: 'echo test', description: 'test' }
        }
      });

      await commandManager.installRememberCommand();

      const settings = await fs.readJson(mockSettingsPath);
      expect(settings.someOtherSetting).toBe('value');
      expect(settings.slashCommands.existingCommand).toBeDefined();
      expect(settings.slashCommands.remember).toBeDefined();
    });
  });
});
