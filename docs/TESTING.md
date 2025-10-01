# Testing Documentation

## Quick Start

```bash
# Run all tests
npm test

# Run only passing tests (quick check)
npm run test:quick

# Install pre-commit hooks (one-time setup)
npm run setup:hooks
```

## Running Tests

### Basic Test Commands

```bash
# Run all tests
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run only the quick test suite (for pre-commit)
npm run test:quick
```

### Running Specific Tests

```bash
# Run a specific test file
npm test -- tests/date-filters.test.js

# Run tests in a specific directory
npm test -- tests/utils/

# Run tests matching a pattern in the name
npm test -- --testNamePattern="should export"

# Run tests for a specific component
npm test -- --testPathPattern="search"
```

### Test Categories

```bash
# Run only unit tests (utils and date filters)
npm test -- tests/utils.test.js tests/date-filters.test.js

# Run search tests
npm test -- tests/search/

# Run setup tests
npm test -- tests/setup/

# Run CLI tests
npm test -- tests/cli/

# Run export tests
npm test -- tests/export/

# Run integration tests
npm test -- tests/integration/
```

## Pre-Commit Hook

The project includes a pre-commit hook that automatically runs before each commit to ensure code quality.

### Setup (One-Time)

```bash
# Install the pre-commit hook
npm run setup:hooks
```

This will install a Git hook that:
1. ✅ Runs ESLint to check code style
2. ✅ Runs the quick test suite
3. ✅ Blocks the commit if any checks fail

### What Gets Tested on Commit

The pre-commit hook runs `npm run precommit`, which includes:
- **Linting**: All JavaScript files in `src/`
- **Quick Tests**: Essential tests that run fast
  - `tests/basic.test.js` - Infrastructure validation
  - `tests/utils.test.js` - Utility functions
  - `tests/date-filters.test.js` - Date filtering logic

### Skipping Pre-Commit (Emergency Only)

```bash
# Skip pre-commit hooks (not recommended)
git commit --no-verify -m "your message"
```

⚠️ **Warning**: Only skip hooks in emergencies. Always run tests before pushing.

## Test Coverage

### View Coverage Report

```bash
# Generate and view coverage report
npm run test:coverage

# Coverage report is generated in:
# - Terminal output (summary)
# - coverage/lcov-report/index.html (detailed HTML report)
```

### Coverage Requirements

- **Target**: 80% coverage for critical paths
- **Current**: ~30% (focusing on critical utilities)
- **Files with Good Coverage**:
  - `src/utils/date-filters.js` - 75%+
  - Test utilities - 100%

## Test Structure

```
tests/
├── README.md                 # Test suite overview
├── TEST_STRATEGY.md         # Comprehensive test strategy
├── basic.test.js            # Infrastructure tests
├── date-filters.test.js     # Date filter tests
├── utils.test.js            # Utility function tests
│
├── utils/                   # Test utilities
│   ├── test-helpers.js     # Reusable test helpers
│   └── mock-factories.js   # Mock data generators
│
├── fixtures/                # Test data
│   └── conversation-fixtures.js
│
├── search/                  # Search functionality tests
│   └── minisearch-engine.test.js
│
├── setup/                   # Setup system tests
│   └── setup-system.test.js
│
├── cli/                     # CLI interaction tests
│   └── cli-interaction.test.js
│
├── export/                  # Export functionality tests
│   └── export-functionality.test.js
│
└── integration/            # End-to-end tests
    └── integration.test.js
```

## Writing Tests

### Test Template

```javascript
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createTestEnv } from '../utils/test-helpers.js';

describe('Feature Name', () => {
  let testEnv;
  
  beforeEach(async () => {
    testEnv = await createTestEnv();
  });
  
  afterEach(async () => {
    await testEnv.cleanup();
  });
  
  test('should do something specific', async () => {
    // Arrange
    const input = 'test data';
    
    // Act
    const result = await functionUnderTest(input);
    
    // Assert
    expect(result).toBe('expected output');
  });
});
```

### Using Test Helpers

```javascript
import { 
  createTestEnv,
  MockReadline,
  MockInquirer,
  delay 
} from '../utils/test-helpers.js';

import {
  createMockConversation,
  createMockJsonlFile 
} from '../utils/mock-factories.js';

// Create isolated test environment
const env = await createTestEnv();

// Generate mock data
const conversation = createMockConversation({
  name: 'Test Chat',
  messages: [/* ... */]
});

// Create mock JSONL file
await createMockJsonlFile(
  path.join(env.projectsDir, 'test.jsonl'),
  [conversation]
);
```

## Debugging Tests

### Run Tests in Debug Mode

```bash
# Run with Node debugger
node --inspect-brk --experimental-vm-modules node_modules/.bin/jest

# Run specific test with debugging
node --inspect-brk --experimental-vm-modules node_modules/.bin/jest tests/search/minisearch-engine.test.js
```

### Verbose Output

```bash
# Run with verbose output
npm test -- --verbose

# Show console.log output
npm test -- --silent=false
```

### Single Test Focus

```javascript
// Run only this test (add .only)
test.only('should focus on this test', () => {
  // This test will run in isolation
});

// Skip a test (add .skip)
test.skip('should skip this test', () => {
  // This test won't run
});
```

## Continuous Integration

### GitHub Actions (Future)

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run test:coverage
```

## Troubleshooting

### Common Issues

**Tests not running?**
```bash
# Check Node version (need 14+)
node --version

# Clear Jest cache
npx jest --clearCache

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

**Import errors in tests?**
- Ensure all imports use `.js` extension
- Check that `"type": "module"` is in package.json
- Use `--experimental-vm-modules` flag (already in npm scripts)

**Tests timing out?**
```javascript
// Increase timeout for slow tests
test('slow test', async () => {
  // Test code
}, 10000); // 10 second timeout
```

**Mock not working?**
```javascript
// Clear all mocks between tests
afterEach(() => {
  jest.clearAllMocks();
});
```

## Best Practices

1. **Keep tests fast**: Use `test:quick` for frequently-run tests
2. **Clean up**: Always clean up test environments
3. **Isolate tests**: Each test should work independently
4. **Use helpers**: Leverage test utilities and mock factories
5. **Descriptive names**: Test names should explain what they test
6. **AAA Pattern**: Arrange, Act, Assert
7. **Mock external dependencies**: Don't rely on file system or network
8. **Test edge cases**: Empty inputs, errors, boundaries

## Test Maintenance

### Regular Tasks

- **Weekly**: Review failing tests
- **Monthly**: Update test fixtures
- **Quarterly**: Review coverage gaps
- **Per Feature**: Add tests for new functionality

### When to Add Tests

- ✅ New feature implementation
- ✅ Bug fixes (regression tests)
- ✅ Refactoring (ensure behavior unchanged)
- ✅ Complex logic
- ✅ Public API changes

## Getting Help

- Check `tests/TEST_STRATEGY.md` for architectural decisions
- Review `tests/README.md` for current test status
- Look at existing tests for examples
- Run `npm test -- --help` for Jest options