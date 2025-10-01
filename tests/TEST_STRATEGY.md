# Test Strategy Documentation

## Overview

This comprehensive test suite ensures the Claude Conversation Extractor maintains reliability and catches regressions during development. The test architecture uses reusable components, mock factories, and fixtures to enable efficient testing at all levels.

## Test Structure

```
tests/
├── utils/                    # Reusable test utilities
│   ├── test-helpers.js      # Core testing utilities
│   └── mock-factories.js    # Data generation factories
├── fixtures/                 # Test data fixtures
│   └── conversation-fixtures.js
├── search/                   # Search functionality tests
│   └── minisearch-engine.test.js
├── setup/                    # Setup system tests
│   └── setup-system.test.js
├── cli/                      # CLI interaction tests
│   └── cli-interaction.test.js
├── export/                   # Export functionality tests
│   └── export-functionality.test.js
├── integration/              # End-to-end integration tests
│   └── integration.test.js
└── TEST_STRATEGY.md          # This file
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage

# Run specific test suite
npm test -- tests/search/minisearch-engine.test.js

# Run tests matching pattern
npm test -- --testNamePattern="should export"
```

## Test Categories

### 1. Unit Tests
- **Purpose**: Test individual functions and components in isolation
- **Location**: Embedded within feature test files
- **Coverage**: Core utilities, data processing, individual exporters
- **Example**: Date filter functions, search relevance calculation

### 2. Integration Tests
- **Purpose**: Test complete workflows and system interactions
- **Location**: `tests/integration/`
- **Coverage**: Setup workflow, search-to-export pipeline, index management
- **Example**: Complete user journey from setup to export

### 3. Feature Tests
- **Purpose**: Test specific feature areas comprehensively
- **Location**: Organized by feature directory
- **Coverage**: Search, export, CLI, setup
- **Example**: All markdown export variations

## Reusable Test Components

### Test Helpers (`test-helpers.js`)

```javascript
import { 
  createTestEnv,      // Creates isolated test environment
  MockReadline,       // Mocks terminal input/output
  MockInquirer,       // Mocks menu prompts
  ConsoleCapture,     // Captures console output
  waitFor,           // Waits for conditions
  delay              // Simple delay utility
} from './utils/test-helpers.js';
```

### Mock Factories (`mock-factories.js`)

```javascript
import {
  createMockConversation,     // Generate conversation data
  createMockConversationSet,  // Generate multiple conversations
  createMockJsonlFile,        // Create JSONL files
  createMockSearchResult,     // Generate search results
  createMockConfig           // Generate configuration
} from './utils/mock-factories.js';
```

### Fixtures (`conversation-fixtures.js`)

Pre-defined test data for consistent testing:
- `SAMPLE_CONVERSATIONS` - Various conversation types
- `SEARCH_TEST_CASES` - Search scenarios with expected results
- `EXPORT_TEST_CASES` - Export format test cases
- `CLI_SCENARIOS` - Interactive CLI test scenarios

## Testing Patterns

### 1. Isolated Test Environment

```javascript
describe('Feature Test', () => {
  let testEnv;
  
  beforeEach(async () => {
    testEnv = await createTestEnv();
  });
  
  afterEach(async () => {
    await testEnv.cleanup();
  });
  
  test('should work in isolation', async () => {
    // Test uses testEnv.projectsDir, testEnv.conversationsDir
  });
});
```

### 2. Mock Data Generation

```javascript
test('should handle multiple conversations', async () => {
  const conversations = createMockConversationSet({ 
    count: 10,
    topics: ['coding', 'testing']
  });
  
  await createMockJsonlFile(
    path.join(testEnv.projectsDir, 'test.jsonl'),
    conversations
  );
});
```

### 3. Async Testing

```javascript
test('should complete async operation', async () => {
  const result = await performAsyncOperation();
  
  await waitFor(() => result.isComplete, 5000);
  
  expect(result.status).toBe('success');
});
```

### 4. Error Handling

```javascript
test('should handle errors gracefully', async () => {
  await expect(
    functionThatThrows()
  ).rejects.toThrow(/Expected error message/);
});
```

## Key Test Scenarios

### Search Testing
- Exact match search
- Fuzzy search with typos
- Boolean operators (AND, OR)
- Phrase search with quotes
- Date range filtering
- Performance with large datasets

### Export Testing
- All export formats (Markdown, JSON, HTML)
- Detailed vs. simple mode
- Tool use and MCP responses
- Bulk export operations
- Custom templates

### Setup Testing
- Initial setup workflow
- Interrupted setup recovery
- Configuration persistence
- Index building and updates

### CLI Testing
- Keyboard navigation
- Live search with debouncing
- Menu interactions
- Error states

### Integration Testing
- Complete user workflows
- Multi-user scenarios
- Error recovery
- Real-world usage patterns

## Regression Prevention

### Critical Paths to Test

1. **Search Functionality**
   - Always test search after any index changes
   - Verify fuzzy matching still works
   - Check performance doesn't degrade

2. **Export Formats**
   - Ensure all formats produce valid output
   - Verify special characters are escaped
   - Check file naming conflicts are handled

3. **Configuration**
   - Test configuration migration from old formats
   - Verify settings persistence
   - Check default values are sensible

4. **Error Recovery**
   - Test corrupted index recovery
   - Verify missing file handling
   - Check permission errors are handled

## Adding New Tests

### When Adding Features

1. Create test fixtures in `conversation-fixtures.js`
2. Add unit tests in the feature's test file
3. Add integration test in `integration.test.js`
4. Update this documentation

### Test Checklist

- [ ] Unit tests for new functions
- [ ] Integration test for user workflow
- [ ] Error cases handled
- [ ] Edge cases covered
- [ ] Mocks properly cleaned up
- [ ] Test runs in isolation

## Debugging Tests

### Verbose Output

```javascript
test('should debug output', async () => {
  const logger = {
    info: console.log,
    debug: console.log,
    error: console.error
  };
  
  const component = new Component({ logger });
});
```

### Inspecting Test Environment

```javascript
test('should inspect environment', async () => {
  console.log('Test dir:', testEnv.tempDir);
  console.log('Files:', await fs.readdir(testEnv.projectsDir));
});
```

### Running Single Test

```bash
# Run single test file
npm test -- tests/search/minisearch-engine.test.js

# Run single test by name
npm test -- -t "should export conversation to markdown"
```

## Continuous Integration

Tests should be run:
- On every commit (pre-commit hook)
- On pull request creation
- Before merging to main
- Nightly for comprehensive testing

## Maintenance

### Regular Tasks
- Review and update test fixtures monthly
- Check test coverage doesn't drop below 80%
- Remove obsolete tests
- Update mocks when dependencies change

### Test Health Metrics
- Execution time: < 30 seconds for full suite
- Coverage: > 80% for critical paths
- Flakiness: 0% - all tests must be deterministic
- Isolation: Each test must pass when run alone