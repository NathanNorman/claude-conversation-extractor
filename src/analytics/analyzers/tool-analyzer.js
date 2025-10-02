/**
 * Tool Analyzer
 *
 * Analyzes tool usage patterns in conversations.
 * Tracks which tools are used, how often, and in what combinations.
 */

/**
 * Analyze tool usage patterns from JSONL data
 * @param {Array<Object>} conversations - Array of parsed conversations
 * @returns {Object} Tool usage analysis
 */
export function analyzeToolUsage(conversations) {
  if (!conversations || conversations.length === 0) {
    return createEmptyToolUsage();
  }

  const byTool = {};
  const byProject = {};
  const combinations = new Map(); // Map of tool pairs
  const sequences = new Map(); // Map of tool sequences (3+ tools)
  let totalTools = 0;

  // Process each conversation
  for (const conv of conversations) {
    if (!conv.messages || conv.messages.length === 0) {
      continue;
    }

    const toolsInConversation = extractToolsFromMessages(conv.messages);
    totalTools += toolsInConversation.length;

    // Count by tool
    for (const tool of toolsInConversation) {
      byTool[tool] = (byTool[tool] || 0) + 1;
    }

    // Count by project
    if (conv.project) {
      if (!byProject[conv.project]) {
        byProject[conv.project] = {};
      }
      for (const tool of toolsInConversation) {
        byProject[conv.project][tool] = (byProject[conv.project][tool] || 0) + 1;
      }
    }

    // Track combinations (pairs of consecutive tools)
    for (let i = 0; i < toolsInConversation.length - 1; i++) {
      const pair = [toolsInConversation[i], toolsInConversation[i + 1]].sort().join('→');
      combinations.set(pair, (combinations.get(pair) || 0) + 1);
    }

    // Track sequences (triplets of consecutive tools)
    for (let i = 0; i < toolsInConversation.length - 2; i++) {
      const sequence = [
        toolsInConversation[i],
        toolsInConversation[i + 1],
        toolsInConversation[i + 2]
      ].join('→');
      sequences.set(sequence, (sequences.get(sequence) || 0) + 1);
    }
  }

  // Convert combinations to sorted array
  const topCombinations = Array.from(combinations.entries())
    .map(([tools, count]) => ({
      tools: tools.split('→'),
      count
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Convert sequences to sorted array
  const topSequences = Array.from(sequences.entries())
    .map(([sequence, count]) => ({
      sequence: sequence.split('→'),
      count
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    total: totalTools,
    byTool,
    byProject,
    combinations: topCombinations,
    topSequences
  };
}

/**
 * Extract tool names from conversation messages
 * @param {Array<Object>} messages - Array of message objects
 * @returns {Array<string>} Array of tool names in order
 */
function extractToolsFromMessages(messages) {
  const tools = [];

  for (const msg of messages) {
    // Check for tool_use in content array
    if (msg.content && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'tool_use' && block.name) {
          tools.push(block.name);
        }
      }
    }

    // Check for tool information at message level (older format)
    if (msg.role === 'assistant' && msg.content) {
      // Try to extract tool calls from text content
      const toolPattern = /<invoke name="([^"]+)">/g;
      let match;
      while ((match = toolPattern.exec(JSON.stringify(msg.content))) !== null) {
        tools.push(match[1]);
      }
    }
  }

  return tools;
}

/**
 * Parse conversation files to extract tool usage
 * Note: This works with already-parsed conversation data
 * @param {Array<Object>} parsedConversations - Conversations from conversation-analyzer
 * @returns {Object} Tool usage data
 */
export async function analyzeToolsFromParsedData(parsedConversations) {
  // We need to re-parse the files to get detailed tool information
  // The basic conversation analyzer doesn't extract tool names

  const { parseConversationForTools } = await import('./tool-parser.js');

  const conversationsWithTools = [];

  for (const conv of parsedConversations) {
    const toolData = await parseConversationForTools(conv.filePath);
    conversationsWithTools.push({
      project: conv.project,
      fileName: conv.fileName,
      messages: toolData.messages,
      tools: toolData.tools
    });
  }

  return analyzeToolUsage(conversationsWithTools);
}

/**
 * Create empty tool usage structure
 * @returns {Object} Empty tool usage
 */
function createEmptyToolUsage() {
  return {
    total: 0,
    byTool: {},
    byProject: {},
    combinations: [],
    topSequences: []
  };
}

/**
 * Update cache with tool usage analysis
 * @param {Object} cache - Analytics cache
 * @param {Object} toolUsage - Tool usage analysis results
 */
export function updateCacheWithToolUsage(cache, toolUsage) {
  cache.toolUsage = toolUsage;
  return cache;
}
