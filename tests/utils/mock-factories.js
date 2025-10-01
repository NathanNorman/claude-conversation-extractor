/**
 * Mock Factories for Test Data Generation
 * Creates realistic test data for conversations, messages, and other entities
 */

import path from 'path';
import fs from 'fs-extra';

/**
 * Generate a mock conversation message
 */
export function createMockMessage({
  role = 'human',
  content = 'Test message content',
  timestamp = new Date().toISOString(),
  toolUse = null,
  mcpResponse = null,
  attachments = []
} = {}) {
  const message = {
    role,
    content,
    timestamp,
    attachments
  };
  
  if (toolUse) {
    message.tool_use = toolUse;
  }
  
  if (mcpResponse) {
    message.mcp_response = mcpResponse;
  }
  
  return message;
}

/**
 * Generate a mock conversation
 */
export function createMockConversation({
  id = generateId(),
  name = 'Test Conversation',
  created = new Date().toISOString(),
  updated = new Date().toISOString(),
  messages = [],
  projectPath = '/test/project',
  model = 'claude-3-opus'
} = {}) {
  return {
    id,
    name,
    created_at: created,
    updated_at: updated,
    messages: messages.length > 0 ? messages : [
      createMockMessage({ role: 'human', content: 'Hello' }),
      createMockMessage({ role: 'assistant', content: 'Hi there!' })
    ],
    project_path: projectPath,
    model
  };
}

/**
 * Generate a mock tool use
 */
export function createMockToolUse({
  toolName = 'read_file',
  input = { path: '/test/file.txt' },
  output = 'File contents',
  timestamp = new Date().toISOString()
} = {}) {
  return {
    tool_name: toolName,
    input,
    output,
    timestamp
  };
}

/**
 * Generate a mock MCP response
 */
export function createMockMcpResponse({
  server = 'test-server',
  method = 'test-method',
  params = {},
  result = { success: true },
  timestamp = new Date().toISOString()
} = {}) {
  return {
    server,
    method,
    params,
    result,
    timestamp
  };
}

/**
 * Generate a mock search result
 */
export function createMockSearchResult({
  conversationId = generateId(),
  conversationName = 'Test Conversation',
  messageIndex = 0,
  content = 'Matched content here',
  relevance = 0.95,
  timestamp = new Date().toISOString(),
  highlights = []
} = {}) {
  return {
    conversationId,
    conversationName,
    messageIndex,
    content,
    relevance,
    timestamp,
    highlights
  };
}

/**
 * Generate a mock JSONL file with ONE conversation
 * Converts conversation object to proper JSONL format with type and message fields
 */
export async function createMockJsonlFile(filePath, conversation) {
  const lines = [];
  
  // Handle array of conversations or single conversation
  const conversations = Array.isArray(conversation) ? conversation : [conversation];
  
  for (const conv of conversations) {
    if (conv && conv.messages && Array.isArray(conv.messages)) {
      // For multiple conversations in one file, write each as a complete conversation object
      if (conversations.length > 1) {
        lines.push(JSON.stringify(conv));
      } else {
        // For single conversation, write individual message lines (Claude Code format)
        for (const msg of conv.messages) {
          lines.push(JSON.stringify({
            type: msg.role === 'human' ? 'user' : 'assistant',
            message: {
              role: msg.role === 'human' ? 'user' : 'assistant',
              content: msg.content,
              timestamp: msg.timestamp
            },
            isMeta: false
          }));
        }
      }
    }
  }
  
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, lines.join('\n'));
  return filePath;
}

/**
 * Generate multiple mock JSONL files from conversation set
 * Creates separate files for each conversation
 */
export async function createMockJsonlFiles(baseDir, conversations = []) {
  const filePaths = [];

  for (let i = 0; i < conversations.length; i++) {
    const conv = conversations[i];
    const projectName = conv.name ? conv.name.replace(/[^a-zA-Z0-9-_]/g, '_') : `conversation_${i + 1}`;
    const filePath = path.join(baseDir, `${projectName}.jsonl`);
    await createMockJsonlFile(filePath, conv);
    filePaths.push(filePath);
  }

  return filePaths;
}

/**
 * Generate multiple mock conversations with varied content
 */
export function createMockConversationSet({
  count = 5,
  baseDate = new Date(),
  topics = ['coding', 'testing', 'debugging', 'refactoring', 'documentation']
} = {}) {
  const conversations = [];
  
  for (let i = 0; i < count; i++) {
    const created = new Date(baseDate.getTime() - i * 24 * 60 * 60 * 1000);
    const updated = new Date(created.getTime() + Math.random() * 24 * 60 * 60 * 1000);
    const topic = topics[i % topics.length];
    
    conversations.push(createMockConversation({
      id: `conv-${i + 1}`,
      name: `${topic.charAt(0).toUpperCase() + topic.slice(1)} Session ${i + 1}`,
      created: created.toISOString(),
      updated: updated.toISOString(),
      messages: generateTopicMessages(topic)
    }));
  }
  
  return conversations;
}

/**
 * Generate messages for a specific topic
 */
function generateTopicMessages(topic) {
  const topicMessages = {
    coding: [
      { role: 'human', content: 'Can you help me write a function to parse JSON?' },
      { role: 'assistant', content: 'I\'ll help you create a JSON parser function.' },
      { role: 'human', content: 'It should handle nested objects' },
      { role: 'assistant', content: 'Here\'s a robust JSON parser with nested object support...' }
    ],
    testing: [
      { role: 'human', content: 'How do I write unit tests for async functions?' },
      { role: 'assistant', content: 'For testing async functions, you can use async/await or promises.' },
      { role: 'human', content: 'Show me an example with Jest' },
      { role: 'assistant', content: 'Here\'s a comprehensive Jest test example...' }
    ],
    debugging: [
      { role: 'human', content: 'My code is throwing a null pointer exception' },
      { role: 'assistant', content: 'Let me help you debug that null pointer exception.' },
      { role: 'human', content: 'It happens when I call the API' },
      { role: 'assistant', content: 'The issue might be with async data handling...' }
    ],
    refactoring: [
      { role: 'human', content: 'This function is too complex, can we refactor it?' },
      { role: 'assistant', content: 'I\'ll help you refactor this function for better clarity.' },
      { role: 'human', content: 'I want to apply SOLID principles' },
      { role: 'assistant', content: 'Let\'s apply SOLID principles to improve the design...' }
    ],
    documentation: [
      { role: 'human', content: 'I need to document this API endpoint' },
      { role: 'assistant', content: 'I\'ll help you create comprehensive API documentation.' },
      { role: 'human', content: 'Include examples and error codes' },
      { role: 'assistant', content: 'Here\'s complete documentation with examples and error handling...' }
    ]
  };
  
  const messages = topicMessages[topic] || [
    { role: 'human', content: `Question about ${topic}` },
    { role: 'assistant', content: `Answer about ${topic}` }
  ];
  
  return messages.map(msg => createMockMessage(msg));
}

/**
 * Create a mock search index
 */
export function createMockSearchIndex({
  conversations = [],
  version = '2.0.0'
} = {}) {
  const documents = [];
  
  conversations.forEach(conv => {
    conv.messages.forEach((msg, idx) => {
      documents.push({
        id: `${conv.id}-${idx}`,
        conversationId: conv.id,
        conversationName: conv.name,
        messageIndex: idx,
        content: msg.content,
        role: msg.role,
        timestamp: msg.timestamp || conv.updated_at
      });
    });
  });
  
  return {
    version,
    documents,
    stats: {
      totalDocuments: documents.length,
      totalConversations: conversations.length,
      indexedAt: new Date().toISOString()
    }
  };
}

/**
 * Create mock configuration
 */
export function createMockConfig({
  exportDir = '/test/export',
  indexPath = '/test/index.json',
  setupComplete = true,
  lastExtraction = new Date().toISOString(),
  lastIndexBuild = new Date().toISOString(),
  preferences = {}
} = {}) {
  return {
    exportDirectory: exportDir,
    indexPath,
    setupComplete,
    lastExtraction,
    lastIndexBuild,
    preferences: {
      defaultExportFormat: 'markdown',
      includeSystemMessages: false,
      searchResultsLimit: 10,
      ...preferences
    }
  };
}

/**
 * Create mock CLI arguments
 */
export function createMockArgs({
  search = '',
  export: exportFlag = false,
  format = 'markdown',
  output = null,
  limit = 10,
  detailed = false,
  interactive = true
} = {}) {
  return {
    _: [search],
    search,
    export: exportFlag,
    format,
    output,
    limit,
    detailed,
    interactive,
    i: interactive
  };
}

/**
 * Generate a unique ID
 */
function generateId() {
  return `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a mock file system structure
 */
export async function createMockFileSystem(baseDir) {
  const structure = {
    '.claude': {
      'projects': {
        'project1.jsonl': await createConversationJsonl('project1', 3),
        'project2.jsonl': await createConversationJsonl('project2', 2),
        'test-project.jsonl': await createConversationJsonl('test-project', 5)
      },
      'claude_conversations': {
        'setup.json': JSON.stringify(createMockConfig()),
        'search-index-v2.json': JSON.stringify(createMockSearchIndex()),
        'logging.json': JSON.stringify({
          level: 'info',
          enabled: true,
          maxFileSize: 5242880,
          maxFiles: 3
        })
      }
    }
  };
  
  await createFileStructure(baseDir, structure);
  return baseDir;
}

/**
 * Helper to create conversation JSONL content
 */
async function createConversationJsonl(projectName, count) {
  const conversations = createMockConversationSet({ count });
  
  // Create JSONL format with individual message lines
  const lines = [];
  for (const conv of conversations) {
    for (const msg of conv.messages) {
      lines.push(JSON.stringify({
        type: msg.role === 'human' ? 'user' : 'assistant',
        message: {
          role: msg.role === 'human' ? 'user' : 'assistant',
          content: msg.content,
          timestamp: msg.timestamp
        },
        isMeta: false
      }));
    }
  }
  
  return lines.join('\n');
}

/**
 * Helper to create file structure from object
 */
async function createFileStructure(baseDir, structure) {
  for (const [name, content] of Object.entries(structure)) {
    const fullPath = path.join(baseDir, name);
    
    if (typeof content === 'string') {
      await fs.ensureDir(path.dirname(fullPath));
      await fs.writeFile(fullPath, content);
    } else if (typeof content === 'object') {
      await fs.ensureDir(fullPath);
      await createFileStructure(fullPath, content);
    }
  }
}

