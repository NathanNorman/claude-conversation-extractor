/**
 * User Action Analyzer
 *
 * Analyzes user-initiated actions (not Claude's tool usage):
 * - Slash command usage (/remember, /debug, /youre-not-done, etc.)
 * - Hook executions (post-tool-use-hook, user-prompt-submit-hook)
 * - Custom commands and interactions
 *
 * This focuses on what the USER does, not what Claude does.
 */

import { parseConversationForTools } from './tool-parser.js';

// Built-in Claude Code commands to exclude (not user-created)
const BUILTIN_COMMANDS = new Set([
  '/model',      // Switch AI model
  '/exit',       // Exit program
  '/clear',      // Clear screen
  '/docs',       // Show documentation
  '/init',       // Initialize
  '/login',      // Login
  '/mcp',        // MCP commands
  '/mcp-status', // MCP status
  '/context',    // Show context
  '/help',       // Help
  '/settings',   // Settings
  '/reset'       // Reset
]);

/**
 * Analyze user actions from conversations
 * @param {Array<Object>} conversations - Conversations with file paths
 * @returns {Promise<Object>} User action analysis
 */
export async function analyzeUserActions(conversations) {
  const slashCommands = {};
  const hookExecutions = {};
  let totalSlashCommands = 0;
  let totalHookExecutions = 0;

  for (const conv of conversations) {
    if (!conv.filePath) continue;

    try {
      const data = await parseConversationForTools(conv.filePath);

      for (const msg of data.messages) {
        // Extract slash commands from user messages
        if (msg.role === 'user' && msg.content) {
          const commands = extractSlashCommands(msg.content);
          for (const cmd of commands) {
            // Skip built-in Claude Code commands - only track custom user commands
            if (!BUILTIN_COMMANDS.has(cmd)) {
              slashCommands[cmd] = (slashCommands[cmd] || 0) + 1;
              totalSlashCommands++;
            }
          }
        }

        // Extract hook executions from system messages
        const hooks = extractHookExecutions(msg.content);
        for (const hook of hooks) {
          hookExecutions[hook] = (hookExecutions[hook] || 0) + 1;
          totalHookExecutions++;
        }
      }
    } catch (error) {
      // Skip conversations that can't be parsed
      continue;
    }
  }

  // Sort by frequency
  const topSlashCommands = Object.entries(slashCommands)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const topHooks = Object.entries(hookExecutions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return {
    slashCommands: {
      total: totalSlashCommands,
      byCommand: slashCommands,
      topCommands: topSlashCommands
    },
    hooks: {
      total: totalHookExecutions,
      byHook: hookExecutions,
      topHooks: topHooks
    }
  };
}

/**
 * Extract slash command names from message content
 * @param {*} content - Message content (string or array)
 * @returns {Array<string>} Slash command names
 */
function extractSlashCommands(content) {
  const commands = [];

  let text = '';
  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === 'text' && block.text) {
        text += block.text + '\n';
      }
    }
  }

  // Pattern: <command-name>/command-name</command-name>
  const commandPattern = /<command-name>\/([\w-]+)<\/command-name>/g;
  let match;

  while ((match = commandPattern.exec(text)) !== null) {
    commands.push(`/${match[1]}`);
  }

  return commands;
}

/**
 * Extract hook names from message content
 * @param {*} content - Message content
 * @returns {Array<string>} Hook names
 */
function extractHookExecutions(content) {
  const hooks = [];

  let text = '';
  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === 'text' && block.text) {
        text += block.text + '\n';
      }
    }
  }

  // Primary pattern: [~/.claude/hooks/hookname.sh]
  // This appears in both user messages (hook feedback) and system reminders
  const hookFilePattern = /\[~?\/?\.?claude\/hooks\/([\w-]+)\.sh\]/g;
  let match;

  while ((match = hookFilePattern.exec(text)) !== null) {
    hooks.push(match[1]); // Just the hook name without .sh
  }

  // Also match PreToolUse and PostToolUse patterns
  // Pattern: [PreToolUse:ToolName] or [PostToolUse:ToolName] followed by [~/.claude/hooks/...]
  const toolUseHookPattern = /\[(Pre|Post)ToolUse:[^\]]+\]\s*\[~?\/?\.?claude\/hooks\/([\w-]+)\.sh\]/g;
  while ((match = toolUseHookPattern.exec(text)) !== null) {
    hooks.push(match[2]); // Hook name
  }

  return hooks;
}

/**
 * Update cache with user action analysis
 * @param {Object} cache - Analytics cache
 * @param {Object} userActions - User action analysis
 */
export function updateCacheWithUserActions(cache, userActions) {
  cache.userActions = userActions;
  return cache;
}
