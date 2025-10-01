/**
 * Command Manager for Claude Code Slash Commands
 *
 * Manages installation and removal of custom slash commands like /remember
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

export class CommandManager {
  constructor(options = {}) {
    this.settingsPath = options.settingsPath || join(homedir(), '.claude', 'settings.json');
    this.commandsDir = options.commandsDir || join(homedir(), '.claude', 'commands');
    this.logger = options.logger || console;
  }

  /**
   * Check if the /remember command is installed
   * @returns {Promise<boolean>}
   */
  async isRememberCommandInstalled() {
    try {
      if (!existsSync(this.settingsPath)) {
        return false;
      }

      const settingsData = await readFile(this.settingsPath, 'utf-8');
      const settings = JSON.parse(settingsData);

      // Check if slashCommands exist and has /remember
      if (!settings.slashCommands || !settings.slashCommands.remember) {
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(colors.error(`Error checking command status: ${error.message}`));
      return false;
    }
  }

  /**
   * Get the command script path
   * @returns {string}
   */
  getRememberScriptPath() {
    // Use absolute path to globally installed package
    const globalPaths = [
      '/opt/homebrew/lib/node_modules/claude-conversation-extractor/.claude/commands/remember.js',
      '/usr/local/lib/node_modules/claude-conversation-extractor/.claude/commands/remember.js'
    ];

    // Return the most common path on macOS
    return globalPaths[0];
  }

  /**
   * Install the /remember command
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async installRememberCommand() {
    try {
      // Ensure settings directory exists
      const settingsDir = join(homedir(), '.claude');
      if (!existsSync(settingsDir)) {
        await mkdir(settingsDir, { recursive: true });
      }

      // Ensure commands directory exists
      if (!existsSync(this.commandsDir)) {
        await mkdir(this.commandsDir, { recursive: true });
      }

      // Read or create settings
      let settings = {};
      if (existsSync(this.settingsPath)) {
        const settingsData = await readFile(this.settingsPath, 'utf-8');
        settings = JSON.parse(settingsData);
      }

      // Initialize slashCommands structure if needed
      if (!settings.slashCommands) {
        settings.slashCommands = {};
      }

      // Check if already installed
      if (settings.slashCommands.remember) {
        return {
          success: true,
          message: '/remember command is already installed'
        };
      }

      // Add /remember command
      const scriptPath = this.getRememberScriptPath();
      settings.slashCommands.remember = {
        command: `node "${scriptPath}"`,
        description: 'Search previous conversations using natural language',
        timeout: 30
      };

      // Write settings back
      await writeFile(this.settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      return {
        success: true,
        message: '/remember command installed successfully! Restart Claude Code for changes to take effect.'
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to install command: ${error.message}`
      };
    }
  }

  /**
   * Uninstall the /remember command
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async uninstallRememberCommand() {
    try {
      if (!existsSync(this.settingsPath)) {
        return {
          success: true,
          message: 'Command is not installed (no settings file found)'
        };
      }

      const settingsData = await readFile(this.settingsPath, 'utf-8');
      const settings = JSON.parse(settingsData);

      // Check if slashCommands exist
      if (!settings.slashCommands || !settings.slashCommands.remember) {
        return {
          success: true,
          message: 'Command is not installed'
        };
      }

      // Remove /remember command
      delete settings.slashCommands.remember;

      // Clean up empty slashCommands object
      if (Object.keys(settings.slashCommands).length === 0) {
        delete settings.slashCommands;
      }

      // Write settings back
      await writeFile(this.settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      return {
        success: true,
        message: '/remember command uninstalled successfully! Restart Claude Code for changes to take effect.'
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to uninstall command: ${error.message}`
      };
    }
  }

  /**
   * Get command status information
   * @returns {Promise<{installed: boolean, scriptPath: string}>}
   */
  async getCommandStatus() {
    const installed = await this.isRememberCommandInstalled();
    const scriptPath = this.getRememberScriptPath();

    return {
      installed,
      scriptPath,
      settingsPath: this.settingsPath
    };
  }
}

export default CommandManager;
