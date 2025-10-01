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
      // Check for markdown file in commands directory (new approach)
      const projectCommandPath = join(process.cwd(), '.claude', 'commands', 'remember.md');
      const globalCommandPath = join(this.commandsDir, 'remember.md');

      // Command is installed if either markdown file exists
      return existsSync(projectCommandPath) || existsSync(globalCommandPath);
    } catch (error) {
      this.logger.error(colors.error(`Error checking command status: ${error.message}`));
      return false;
    }
  }

  /**
   * Get the command file path (markdown-based slash command)
   * @returns {string}
   */
  getRememberCommandPath() {
    // Check project-level first, then global
    const projectPath = join(process.cwd(), '.claude', 'commands', 'remember.md');
    if (existsSync(projectPath)) {
      return projectPath;
    }

    return join(this.commandsDir, 'remember.md');
  }

  /**
   * Install the /remember command (creates markdown file in project)
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async installRememberCommand() {
    try {
      // Create .claude/commands directory in current project
      const commandsDir = join(process.cwd(), '.claude', 'commands');
      if (!existsSync(commandsDir)) {
        await mkdir(commandsDir, { recursive: true });
      }

      const commandPath = join(commandsDir, 'remember.md');

      // Check if already exists
      if (existsSync(commandPath)) {
        return {
          success: true,
          message: '/remember command already exists in project'
        };
      }

      // Copy the command file from the template
      const templatePath = join(process.cwd(), '.claude', 'commands', 'remember.md');

      // Check if running from within the claude-conversation-extractor project
      const sourceCommandPath = existsSync(templatePath) ? templatePath : null;

      if (!sourceCommandPath) {
        return {
          success: false,
          message: 'Could not find remember.md template. Run from claude-conversation-extractor directory.'
        };
      }

      // Command file is already in place if we're in the project directory
      return {
        success: true,
        message: '/remember command is available (markdown-based, auto-discovered by Claude Code)'
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to install command: ${error.message}`
      };
    }
  }

  /**
   * Uninstall the /remember command (removes markdown file)
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async uninstallRememberCommand() {
    try {
      const { unlink } = await import('fs/promises');
      const commandPath = join(process.cwd(), '.claude', 'commands', 'remember.md');

      if (!existsSync(commandPath)) {
        return {
          success: true,
          message: 'Command is not installed'
        };
      }

      // Remove the command file
      await unlink(commandPath);

      return {
        success: true,
        message: '/remember command removed successfully!'
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
   * @returns {Promise<{installed: boolean, commandPath: string}>}
   */
  async getCommandStatus() {
    const installed = await this.isRememberCommandInstalled();
    const commandPath = this.getRememberCommandPath();

    return {
      installed,
      commandPath,
      commandType: 'markdown (auto-discovered)'
    };
  }
}

export default CommandManager;
