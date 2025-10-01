/**
 * Command Manager for Claude Code Slash Commands
 *
 * Manages installation and removal of custom slash commands like /remember
 */

import { mkdir } from 'fs/promises';
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
      // Check for markdown file in global commands directory
      const commandPath = join(this.commandsDir, 'remember.md');
      return existsSync(commandPath);
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
    return join(this.commandsDir, 'remember.md');
  }

  /**
   * Get the /remember command markdown content
   * @returns {string}
   */
  getRememberCommandContent() {
    return `---
allowed-tools: Bash
description: Search previous conversations using natural language
argument-hint: [search query or date filter]
---

# Finding Previous Conversations

The user asked to remember: **"$ARGUMENTS"**

## Your Task

Search through their previous Claude Code conversation history using \`claude-logs\` in non-interactive mode.

## Available Search Commands

### Search by content
\`\`\`bash
claude-logs --search "$ARGUMENTS" --json --limit 10
\`\`\`

### Filter by date (if query mentions time)
- If query mentions "yesterday": \`--filter-date yesterday\`
- If query mentions "last week": \`--filter-date lastweek\`
- If query mentions "today": \`--filter-date today\`
- If query mentions "last month": \`--filter-date lastmonth\`

### Filter by project (if query mentions project name)
\`\`\`bash
claude-logs --search "keywords" --filter-repo "project-name" --json
\`\`\`

## Command to Run

Based on the user's query, construct and run the appropriate \`claude-logs\` command.

**Example queries:**
- "API authentication" → \`claude-logs --search "API authentication" --json\`
- "what did I work on yesterday" → \`claude-logs --filter-date yesterday --json\`
- "database schema last week" → \`claude-logs --search "database schema" --filter-date lastweek --json\`

## After Getting Results

1. Parse the JSON output
2. Summarize what conversations were found
3. Show the most relevant results (project, date, preview)
4. Ask if the user wants to see more details or open a specific conversation

**Note:** The JSON output includes \`filePath\` for each result - you can read those files to show full conversation content.
`;
  }

  /**
   * Install the /remember command (creates markdown file)
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async installRememberCommand() {
    try {
      const { writeFile: writeFileAsync } = await import('fs/promises');

      // Create .claude/commands directory
      if (!existsSync(this.commandsDir)) {
        await mkdir(this.commandsDir, { recursive: true });
      }

      const commandPath = join(this.commandsDir, 'remember.md');

      // Check if already exists
      if (existsSync(commandPath)) {
        return {
          success: true,
          message: '/remember command already installed'
        };
      }

      // Generate the command file
      const content = this.getRememberCommandContent();
      await writeFileAsync(commandPath, content, 'utf-8');

      return {
        success: true,
        message: '/remember command installed successfully! Available immediately in Claude Code.'
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
      const commandPath = join(this.commandsDir, 'remember.md');

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
