/**
 * Conversation Test Fixtures
 * Predefined test data for various testing scenarios
 */

export const SAMPLE_CONVERSATIONS = {
  simple: {
    id: 'conv-simple-1',
    name: 'Simple Chat',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:30:00Z',
    messages: [
      {
        role: 'human',
        content: 'What is JavaScript?',
        timestamp: '2024-01-15T10:00:00Z'
      },
      {
        role: 'assistant',
        content: 'JavaScript is a programming language commonly used for web development.',
        timestamp: '2024-01-15T10:01:00Z'
      }
    ]
  },
  
  withTools: {
    id: 'conv-tools-1',
    name: 'Development Session',
    created_at: '2024-01-16T14:00:00Z',
    updated_at: '2024-01-16T15:45:00Z',
    messages: [
      {
        role: 'human',
        content: 'Can you read the config file?',
        timestamp: '2024-01-16T14:00:00Z'
      },
      {
        role: 'assistant',
        content: 'I\'ll read the config file for you.',
        timestamp: '2024-01-16T14:00:30Z',
        tool_use: {
          tool_name: 'read_file',
          input: { path: '/project/config.json' },
          output: '{"version": "1.0.0", "name": "test-app"}'
        }
      },
      {
        role: 'assistant',
        content: 'The config shows version 1.0.0 for test-app.',
        timestamp: '2024-01-16T14:01:00Z'
      }
    ]
  },
  
  withMcp: {
    id: 'conv-mcp-1',
    name: 'MCP Testing',
    created_at: '2024-01-17T09:00:00Z',
    updated_at: '2024-01-17T09:30:00Z',
    messages: [
      {
        role: 'human',
        content: 'Query the database for users',
        timestamp: '2024-01-17T09:00:00Z'
      },
      {
        role: 'assistant',
        content: 'I\'ll query the database for you.',
        timestamp: '2024-01-17T09:00:30Z',
        mcp_response: {
          server: 'database-server',
          method: 'query',
          params: { sql: 'SELECT * FROM users' },
          result: { rows: 5, data: [] }
        }
      },
      {
        role: 'assistant',
        content: 'Found 5 users in the database.',
        timestamp: '2024-01-17T09:01:00Z'
      }
    ]
  },
  
  longConversation: {
    id: 'conv-long-1',
    name: 'Extended Discussion',
    created_at: '2024-01-10T08:00:00Z',
    updated_at: '2024-01-10T18:00:00Z',
    messages: Array.from({ length: 50 }, (_, i) => ({
      role: i % 2 === 0 ? 'human' : 'assistant',
      content: i % 2 === 0 
        ? `Question ${Math.floor(i/2) + 1} about topic ${Math.floor(i/10) + 1}`
        : `Answer ${Math.floor(i/2) + 1} explaining topic ${Math.floor(i/10) + 1} in detail`,
      timestamp: new Date(Date.parse('2024-01-10T08:00:00Z') + i * 10 * 60000).toISOString()
    }))
  },
  
  withCodeBlocks: {
    id: 'conv-code-1',
    name: 'Code Review Session',
    created_at: '2024-01-18T11:00:00Z',
    updated_at: '2024-01-18T12:00:00Z',
    messages: [
      {
        role: 'human',
        content: 'Review this Python function',
        timestamp: '2024-01-18T11:00:00Z'
      },
      {
        role: 'assistant',
        content: `Here's an improved version:\n\n\`\`\`python
def calculate_average(numbers):
    """Calculate the average of a list of numbers."""
    if not numbers:
        return 0
    return sum(numbers) / len(numbers)
\`\`\`\n\nThis handles empty lists and is more readable.`,
        timestamp: '2024-01-18T11:01:00Z'
      }
    ]
  },
  
  withAttachments: {
    id: 'conv-attach-1',
    name: 'Document Review',
    created_at: '2024-01-19T13:00:00Z',
    updated_at: '2024-01-19T14:00:00Z',
    messages: [
      {
        role: 'human',
        content: 'Please review these files',
        timestamp: '2024-01-19T13:00:00Z',
        attachments: [
          { type: 'file', path: '/docs/readme.md' },
          { type: 'file', path: '/docs/api.md' }
        ]
      },
      {
        role: 'assistant',
        content: 'I\'ve reviewed both documentation files. They look well-structured.',
        timestamp: '2024-01-19T13:05:00Z'
      }
    ]
  },
  
  errorScenario: {
    id: 'conv-error-1',
    name: 'Error Handling Test',
    created_at: '2024-01-20T10:00:00Z',
    updated_at: '2024-01-20T10:15:00Z',
    messages: [
      {
        role: 'human',
        content: 'Try to read a non-existent file',
        timestamp: '2024-01-20T10:00:00Z'
      },
      {
        role: 'assistant',
        content: 'I\'ll attempt to read that file.',
        timestamp: '2024-01-20T10:00:30Z',
        tool_use: {
          tool_name: 'read_file',
          input: { path: '/non/existent/file.txt' },
          output: null,
          error: 'File not found: /non/existent/file.txt'
        }
      },
      {
        role: 'assistant',
        content: 'The file doesn\'t exist. Would you like me to create it?',
        timestamp: '2024-01-20T10:01:00Z'
      }
    ]
  },
  
  multiProject: {
    id: 'conv-multi-1',
    name: 'Cross-Project Work',
    created_at: '2024-01-21T15:00:00Z',
    updated_at: '2024-01-21T17:00:00Z',
    project_path: '/workspace/project-a',
    messages: [
      {
        role: 'human',
        content: 'Let\'s work on multiple projects',
        timestamp: '2024-01-21T15:00:00Z'
      },
      {
        role: 'assistant',
        content: 'I can help you work across multiple projects.',
        timestamp: '2024-01-21T15:01:00Z'
      }
    ]
  }
};

/**
 * Search test cases with expected results
 */
export const SEARCH_TEST_CASES = [
  {
    query: 'JavaScript',
    expectedIn: ['simple', 'withCodeBlocks'],
    notExpectedIn: ['withTools', 'withMcp']
  },
  {
    query: 'database users',
    expectedIn: ['withMcp'],
    notExpectedIn: ['simple', 'withTools']
  },
  {
    query: 'config file',
    expectedIn: ['withTools'],
    notExpectedIn: ['simple', 'withMcp']
  },
  {
    query: 'python function average',
    expectedIn: ['withCodeBlocks'],
    notExpectedIn: ['simple', 'withTools']
  },
  {
    query: 'error file not found',
    expectedIn: ['errorScenario'],
    notExpectedIn: ['simple', 'withTools']
  }
];

/**
 * Date filter test cases
 */
export const DATE_FILTER_TEST_CASES = [
  {
    filter: 'TODAY',
    baseDate: new Date('2024-01-20T12:00:00Z'),
    expectedConversations: ['errorScenario']
  },
  {
    filter: 'LAST_WEEK',
    baseDate: new Date('2024-01-22T12:00:00Z'),
    expectedConversations: ['simple', 'withTools', 'withMcp', 'withCodeBlocks', 'withAttachments', 'errorScenario', 'multiProject']
  },
  {
    filter: 'CUSTOM',
    customRange: {
      start: '2024-01-15',
      end: '2024-01-17'
    },
    expectedConversations: ['simple', 'withTools', 'withMcp']
  }
];

/**
 * Export format test cases
 */
export const EXPORT_TEST_CASES = [
  {
    format: 'markdown',
    conversation: 'simple',
    expectedPatterns: [
      '# Simple Chat',
      '**Human:**',
      '**Assistant:**',
      'What is JavaScript?',
      'JavaScript is a programming language'
    ]
  },
  {
    format: 'json',
    conversation: 'simple',
    expectedStructure: {
      id: 'string',
      name: 'string',
      messages: 'array',
      created_at: 'string',
      updated_at: 'string'
    }
  },
  {
    format: 'html',
    conversation: 'simple',
    expectedPatterns: [
      '<html>',
      '<title>Simple Chat</title>',
      '<div class="message human">',
      '<div class="message assistant">',
      'What is JavaScript?'
    ]
  }
];

/**
 * Performance test scenarios
 */
export const PERFORMANCE_SCENARIOS = {
  small: {
    conversationCount: 10,
    averageMessageCount: 5,
    expectedIndexTime: 1000, // ms
    expectedSearchTime: 50  // ms
  },
  medium: {
    conversationCount: 100,
    averageMessageCount: 20,
    expectedIndexTime: 5000,
    expectedSearchTime: 100
  },
  large: {
    conversationCount: 1000,
    averageMessageCount: 50,
    expectedIndexTime: 30000,
    expectedSearchTime: 500
  }
};

/**
 * CLI interaction scenarios
 */
export const CLI_SCENARIOS = {
  basicSearch: {
    inputs: ['javascript', '\n'],
    expectedOutputs: ['Search results', 'Simple Chat']
  },
  navigationFlow: {
    inputs: [
      'test',           // search
      '\u001b[B',      // arrow down
      '\u001b[B',      // arrow down
      '\n',            // select
      'b'              // back
    ],
    expectedBehavior: 'Navigate through results and return'
  },
  exportFlow: {
    inputs: [
      'config',        // search
      '\n',           // select result
      'e',            // export
      'markdown',     // format
      'y'             // confirm
    ],
    expectedOutput: 'Export successful'
  }
};

/**
 * Error scenarios for testing error handling
 */
export const ERROR_SCENARIOS = {
  corruptedJsonl: {
    content: 'not valid json\n{"partial": ',
    expectedError: /Failed to parse/
  },
  missingProjectDir: {
    path: '/non/existent/path',
    expectedError: /ENOENT/
  },
  invalidSearchIndex: {
    content: '{"version": "0.0.1", "invalid": true}',
    expectedError: /Invalid index/
  },
  permissionDenied: {
    permissions: 0o000,
    expectedError: /EACCES|Permission denied/
  }
};

/**
 * Integration test scenarios
 */
export const INTEGRATION_SCENARIOS = {
  fullWorkflow: {
    steps: [
      'setup',
      'extractConversations',
      'buildIndex',
      'performSearch',
      'exportResults'
    ],
    expectedOutcome: 'All steps complete successfully'
  },
  incrementalUpdate: {
    steps: [
      'addNewConversation',
      'updateIndex',
      'searchNewContent'
    ],
    expectedOutcome: 'New content searchable immediately'
  },
  recovery: {
    steps: [
      'corruptIndex',
      'attemptSearch',
      'autoRebuild',
      'retrySearch'
    ],
    expectedOutcome: 'System recovers and search works'
  }
};