/**
 * Tests for CommandManager - /remember Markdown Slash Command
 * Updated for Claude Code v1.0+ markdown-based slash commands
 */

import { jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import { CommandManager } from '../../src/setup/command-manager.js';
import { createTestEnv } from '../utils/test-helpers.js';

describe('CommandManager (Markdown-Based)', () => {
  let testEnv;
  let commandManager;
  let commandsDir;
  let originalCwd;

  beforeEach(async () => {
    testEnv = await createTestEnv();
    commandsDir = path.join(testEnv.tempDir, '.claude', 'commands');
    commandManager = new CommandManager({ commandsDir });

    // Save and change to test directory
    originalCwd = process.cwd();
    process.chdir(testEnv.tempDir);
  });

  afterEach(async () => {
    // Restore working directory first
    process.chdir(originalCwd);
    await testEnv.cleanup();
  });

  describe('/remember Command Detection', () => {
    test('should detect when remember.md exists in project', async () => {
      // Create .claude/commands directory in project
      const projectCommandsDir = path.join(process.cwd(), '.claude', 'commands');
      await fs.ensureDir(projectCommandsDir);
      await fs.writeFile(
        path.join(projectCommandsDir, 'remember.md'),
        '# Test command'
      );

      const installed = await commandManager.isRememberCommandInstalled();
      expect(installed).toBe(true);
    });

    test('should detect when remember.md exists in global commands', async () => {
      // Create command in global directory
      await fs.ensureDir(commandsDir);
      await fs.writeFile(
        path.join(commandsDir, 'remember.md'),
        '# Test command'
      );

      const installed = await commandManager.isRememberCommandInstalled();
      expect(installed).toBe(true);
    });

    test('should return false when remember.md does not exist', async () => {
      const installed = await commandManager.isRememberCommandInstalled();
      expect(installed).toBe(false);
    });
  });

  describe('Command Installation', () => {
    test('should report success if remember.md already exists in project', async () => {
      // Pre-create the command file
      const projectCommandsDir = path.join(process.cwd(), '.claude', 'commands');
      await fs.ensureDir(projectCommandsDir);
      await fs.writeFile(
        path.join(projectCommandsDir, 'remember.md'),
        '# Existing command'
      );

      const result = await commandManager.installRememberCommand();

      expect(result.success).toBe(true);
      expect(result.message).toContain('already exists');
    });

    test('should verify remember.md exists when running from claude-conversation-extractor', async () => {
      // Create the command file to simulate being in the project
      const projectCommandsDir = path.join(process.cwd(), '.claude', 'commands');
      await fs.ensureDir(projectCommandsDir);
      await fs.writeFile(
        path.join(projectCommandsDir, 'remember.md'),
        '---\nallowed-tools: Bash\n---\n# Remember command'
      );

      const result = await commandManager.installRememberCommand();

      expect(result.success).toBe(true);
    });
  });

  describe('Command Uninstallation', () => {
    test('should remove remember.md from project', async () => {
      // Create command file first
      const projectCommandsDir = path.join(process.cwd(), '.claude', 'commands');
      await fs.ensureDir(projectCommandsDir);
      const commandPath = path.join(projectCommandsDir, 'remember.md');
      await fs.writeFile(commandPath, '# Test command');

      // Verify it exists
      expect(fs.existsSync(commandPath)).toBe(true);

      // Uninstall
      const result = await commandManager.uninstallRememberCommand();

      expect(result.success).toBe(true);
      expect(result.message).toContain('removed successfully');
      expect(fs.existsSync(commandPath)).toBe(false);
    });

    test('should handle uninstalling when command does not exist', async () => {
      const result = await commandManager.uninstallRememberCommand();

      expect(result.success).toBe(true);
      expect(result.message).toContain('not installed');
    });
  });

  describe('Command Status', () => {
    test('should return correct status and command path', async () => {
      const status = await commandManager.getCommandStatus();

      expect(status).toHaveProperty('installed');
      expect(status).toHaveProperty('commandPath');
      expect(status).toHaveProperty('commandType');
      expect(status.commandType).toBe('markdown (auto-discovered)');
    });

    test('should return installed: true when remember.md exists', async () => {
      // Create command
      const projectCommandsDir = path.join(process.cwd(), '.claude', 'commands');
      await fs.ensureDir(projectCommandsDir);
      await fs.writeFile(
        path.join(projectCommandsDir, 'remember.md'),
        '# Test'
      );

      const status = await commandManager.getCommandStatus();

      expect(status.installed).toBe(true);
      expect(status.commandPath).toContain('remember.md');
    });

    test('should return installed: false when remember.md does not exist', async () => {
      const status = await commandManager.getCommandStatus();

      expect(status.installed).toBe(false);
    });
  });
});
