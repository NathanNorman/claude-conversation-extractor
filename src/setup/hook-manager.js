/**
 * Hook Manager for Claude Code Auto-Export Hook
 *
 * Manages installation and removal of the SessionEnd hook that automatically
 * exports conversations to markdown when a Claude Code session ends.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import chalk from 'chalk';

const colors = {
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.cyan,
  dim: chalk.hex('#606060')
};

export class HookManager {
  constructor(options = {}) {
    this.settingsPath = options.settingsPath || join(homedir(), '.claude', 'settings.json');
    this.projectRoot = options.projectRoot || process.cwd();
    this.hookScriptPath = join(this.projectRoot, '.claude', 'hooks', 'auto-export-conversation.js');
    this.logger = options.logger || console;
  }

  /**
   * Check if the auto-export hook is installed
   * @returns {Promise<boolean>}
   */
  async isHookInstalled() {
    try {
      if (!existsSync(this.settingsPath)) {
        return false;
      }

      const settingsData = await readFile(this.settingsPath, 'utf-8');
      const settings = JSON.parse(settingsData);

      // Check if hooks exist
      if (!settings.hooks || !settings.hooks.SessionEnd) {
        return false;
      }

      // Check if our hook is in the SessionEnd hooks
      for (const hookGroup of settings.hooks.SessionEnd) {
        if (!hookGroup.hooks) continue;

        for (const hook of hookGroup.hooks) {
          if (hook.command && hook.command.includes('auto-export-conversation.js')) {
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      this.logger.error(colors.error(`Error checking hook status: ${error.message}`));
      return false;
    }
  }

  /**
   * Get the hook command that will be used
   * @returns {string}
   */
  getHookCommand() {
    // Use absolute path to globally installed package
    // This ensures the hook works from any project, not just claude-conversation-extractor

    const globalPaths = [
      '/opt/homebrew/lib/node_modules/claude-conversation-extractor/.claude/hooks/auto-export-conversation.js',
      '/usr/local/lib/node_modules/claude-conversation-extractor/.claude/hooks/auto-export-conversation.js',
      // Fallback to project-relative
      '$CLAUDE_PROJECT_DIR/.claude/hooks/auto-export-conversation.js'
    ];

    // Find first path that exists
    for (const path of globalPaths) {
      if (path.startsWith('$')) {
        return `node "${path}"`; // Return env var path as-is
      }
      if (existsSync(path)) {
        return `node "${path}"`;
      }
    }

    // Default to first path if none exist (will error at runtime, which is fine)
    return `node "${globalPaths[0]}"`;
  }

  /**
   * Install the auto-export hook
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async installHook() {
    try {
      // Ensure settings directory exists
      const settingsDir = join(homedir(), '.claude');
      if (!existsSync(settingsDir)) {
        await mkdir(settingsDir, { recursive: true });
      }

      // Read or create settings
      let settings = {};
      if (existsSync(this.settingsPath)) {
        const settingsData = await readFile(this.settingsPath, 'utf-8');
        settings = JSON.parse(settingsData);
      }

      // Initialize hooks structure if needed
      if (!settings.hooks) {
        settings.hooks = {};
      }

      if (!settings.hooks.SessionEnd) {
        settings.hooks.SessionEnd = [];
      }

      // Check if already installed
      const alreadyInstalled = await this.isHookInstalled();
      if (alreadyInstalled) {
        return {
          success: true,
          message: 'Auto-export hook is already installed'
        };
      }

      // Add our hook
      const hookCommand = this.getHookCommand();
      settings.hooks.SessionEnd.push({
        hooks: [
          {
            type: 'command',
            command: hookCommand,
            timeout: 10
          }
        ]
      });

      // Write settings back
      await writeFile(this.settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      return {
        success: true,
        message: 'Auto-export hook installed successfully! Restart Claude Code for changes to take effect.'
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to install hook: ${error.message}`
      };
    }
  }

  /**
   * Uninstall the auto-export hook
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async uninstallHook() {
    try {
      if (!existsSync(this.settingsPath)) {
        return {
          success: true,
          message: 'Hook is not installed (no settings file found)'
        };
      }

      const settingsData = await readFile(this.settingsPath, 'utf-8');
      const settings = JSON.parse(settingsData);

      // Check if hooks exist
      if (!settings.hooks || !settings.hooks.SessionEnd) {
        return {
          success: true,
          message: 'Hook is not installed'
        };
      }

      // Remove our hook from SessionEnd hooks
      let removed = false;
      settings.hooks.SessionEnd = settings.hooks.SessionEnd.filter(hookGroup => {
        if (!hookGroup.hooks) return true;

        hookGroup.hooks = hookGroup.hooks.filter(hook => {
          const isOurHook = hook.command && hook.command.includes('auto-export-conversation.js');
          if (isOurHook) {
            removed = true;
          }
          return !isOurHook;
        });

        // Keep the hook group if it still has hooks
        return hookGroup.hooks.length > 0;
      });

      // Clean up empty SessionEnd array
      if (settings.hooks.SessionEnd.length === 0) {
        delete settings.hooks.SessionEnd;
      }

      // Clean up empty hooks object
      if (Object.keys(settings.hooks).length === 0) {
        delete settings.hooks;
      }

      if (!removed) {
        return {
          success: true,
          message: 'Hook was not installed'
        };
      }

      // Write settings back
      await writeFile(this.settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      return {
        success: true,
        message: 'Auto-export hook uninstalled successfully! Restart Claude Code for changes to take effect.'
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to uninstall hook: ${error.message}`
      };
    }
  }

  /**
   * Get hook status information
   * @returns {Promise<{installed: boolean, scriptExists: boolean, hookCommand: string}>}
   */
  async getHookStatus() {
    const installed = await this.isHookInstalled();
    const scriptExists = existsSync(this.hookScriptPath);

    return {
      installed,
      scriptExists,
      hookCommand: this.getHookCommand(),
      settingsPath: this.settingsPath,
      hookScriptPath: this.hookScriptPath
    };
  }
}

export default HookManager;
