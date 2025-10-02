/**
 * Tool Parser
 *
 * Specialized parser for extracting tool usage information from JSONL files.
 * Works alongside conversation-analyzer to get detailed tool data.
 */

import { createReadStream } from 'fs';
import { createInterface } from 'readline';

/**
 * Parse a conversation file specifically for tool information
 * @param {string} filePath - Path to JSONL file
 * @returns {Promise<Object>} Tool usage data
 */
export async function parseConversationForTools(filePath) {
  const messages = [];
  const tools = [];

  try {
    const fileStream = createReadStream(filePath);
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (!line.trim()) {
        continue;
      }

      try {
        const entry = JSON.parse(line);

        // Extract tool usage from various formats
        const toolsInEntry = extractToolsFromEntry(entry);
        tools.push(...toolsInEntry);

        // Store message with content for further analysis
        if (entry.message) {
          messages.push({
            role: entry.message.role,
            content: entry.message.content,
            timestamp: entry.timestamp
          });
        }
      } catch (parseError) {
        // Skip malformed lines
        continue;
      }
    }
  } catch (error) {
    console.warn(`Failed to parse tools from ${filePath}:`, error.message);
  }

  return {
    messages,
    tools,
    toolCount: tools.length
  };
}

/**
 * Extract tool names from a JSONL entry
 * @param {Object} entry - Parsed JSONL entry
 * @returns {Array<string>} Tool names found
 */
function extractToolsFromEntry(entry) {
  const tools = [];

  // Method 1: Check for tool_use content blocks
  if (entry.message && entry.message.content) {
    if (Array.isArray(entry.message.content)) {
      for (const block of entry.message.content) {
        if (block.type === 'tool_use' && block.name) {
          tools.push(block.name);
        }
      }
    } else if (typeof entry.message.content === 'string') {
      // Method 2: Parse tool invocations from string content
      // Look for <invoke name="ToolName"> patterns
      const invokePattern = /<invoke name="([^"]+)">/g;
      let match;
      while ((match = invokePattern.exec(entry.message.content)) !== null) {
        tools.push(match[1]);
      }
    }
  }

  // Method 3: Check for tool_use type entries
  if (entry.type === 'tool_use' && entry.name) {
    tools.push(entry.name);
  }

  // Method 4: Check for toolName field
  if (entry.toolName) {
    tools.push(entry.toolName);
  }

  return tools;
}

/**
 * Extract code blocks from message content
 * @param {Object} message - Message object
 * @returns {Array<Object>} Code blocks with language tags
 */
export function extractCodeBlocks(message) {
  const codeBlocks = [];

  if (!message || !message.content) {
    return codeBlocks;
  }

  let content = '';

  // Handle different content formats
  if (typeof message.content === 'string') {
    content = message.content;
  } else if (Array.isArray(message.content)) {
    // Extract text from content blocks
    for (const block of message.content) {
      if (block.type === 'text' && block.text) {
        content += block.text + '\n';
      }
    }
  }

  // Match fenced code blocks with language tags
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const language = match[1] || 'unknown';
    const code = match[2];

    codeBlocks.push({
      language: language.toLowerCase(),
      code,
      length: code.length
    });
  }

  return codeBlocks;
}

/**
 * Detect frameworks mentioned in text content
 * @param {string} content - Text content
 * @returns {Object} Framework mentions
 */
export function detectFrameworks(content) {
  if (!content || typeof content !== 'string') {
    return {};
  }

  const frameworks = {
    // JavaScript/TypeScript
    react: /\b(react|jsx|usestate|useeffect|component|props)\b/gi,
    vue: /\b(vue|v-if|v-for|computed|vuex)\b/gi,
    angular: /\b(angular|@component|ngmodel|@input)\b/gi,
    express: /\b(express|app\.get|app\.post|middleware|req|res)\b/gi,
    nextjs: /\b(next|getserversideprops|getstaticprops)\b/gi,

    // Testing
    jest: /\b(jest|describe|it\(|expect\(|test\(|mock)\b/gi,
    mocha: /\b(mocha|chai|should|assert)\b/gi,

    // Build tools
    webpack: /\b(webpack|webpack\.config)\b/gi,
    vite: /\b(vite|vite\.config)\b/gi,

    // Node packages
    inquirer: /\b(inquirer|prompt|choices)\b/gi,
    chalk: /\b(chalk|chalk\.(red|green|blue))\b/gi,

    // Python
    django: /\b(django|models\.model|views\.py)\b/gi,
    flask: /\b(flask|@app\.route)\b/gi,
    pytest: /\b(pytest|@pytest)\b/gi,

    // Other
    docker: /\b(docker|dockerfile|docker-compose)\b/gi,
    kubernetes: /\b(kubernetes|kubectl|k8s)\b/gi
  };

  const detected = {};

  for (const [name, pattern] of Object.entries(frameworks)) {
    const matches = content.match(pattern);
    if (matches && matches.length > 0) {
      detected[name] = matches.length;
    }
  }

  return detected;
}
