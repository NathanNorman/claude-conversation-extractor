# Test Process Improvements Needed

## Current Issues Blocking Quick Testing

### 1. **No Direct Access to Search Interface**
- **Problem**: The search interface is deeply embedded in `cli.js` with no clean export
- **Impact**: Can't test search features without going through the entire setup menu
- **Current workaround**: Had to create a separate test file, but ran into import issues

### 2. **Module Export/Import Mismatches**
- **Problem**: `IndexedSearch` is exported as a named export (`export class IndexedSearch`), not default
- **Impact**: Import statements fail with "does not provide an export named 'default'"
- **Fix needed**: Consistent export/import patterns across all modules

### 3. **Missing Standalone Extractor Module**
- **Problem**: The `ClaudeConversationExtractor` class is embedded in `simple-cli.js`, not a separate module
- **Impact**: Can't reuse the extractor functionality in tests or other files
- **Fix needed**: Extract to `src/extractor.js` as a proper module

### 4. **Search Interface Requires Full Setup**
- **Problem**: Can't test the search highlighting without completing the full extraction and indexing
- **Impact**: Testing a simple UI change requires ~3 minutes of setup
- **Fix needed**: Mock data or test mode that bypasses setup

### 5. **No Development/Test Mode**
- **Problem**: The app always uses real data from `~/.claude/projects/`
- **Impact**: Can't test with controlled data sets
- **Fix needed**: Test fixtures and mock data support

## Specific Bugs Found

### 1. **Highlight Rendering Issue**
- **Location**: `src/cli.js` lines 224-263
- **Issue**: The search term highlighting wasn't working because:
  - The highlight markers `[HIGHLIGHT]...[/HIGHLIGHT]` were being stripped out (line 275)
  - The color definition for `highlight` wasn't consistent with the rendering function
- **Status**: Partially fixed - removed stripping, but couldn't test due to access issues

## Recommended Improvements

### 1. **Modularize Core Components**
```javascript
// src/extractor.js
export class ClaudeConversationExtractor { ... }

// src/search/search-interface.js  
export class SearchInterface { ... }

// src/ui/live-search.js
export async function showLiveSearch(searchInterface, options = {}) { ... }
```

### 2. **Add Test Mode**
```javascript
// Support test data directory
const dataPath = process.env.TEST_MODE 
  ? './test/fixtures/projects'
  : join(homedir(), '.claude', 'projects');
```

### 3. **Create Development CLI**
```javascript
// dev-cli.js - Direct access to components
import { showLiveSearch } from './src/ui/live-search.js';
import { IndexedSearch } from './src/search/indexed-search.js';

// Direct commands for testing
const commands = {
  search: () => showLiveSearch(new IndexedSearch()),
  extract: () => extractAll({ testMode: true }),
  // etc.
};
```

### 4. **Add Component Tests**
```javascript
// tests/search-highlight.test.js
test('search highlights matching terms', async () => {
  const search = new IndexedSearch({ testData: mockConversations });
  const results = await search.search('java');
  expect(results[0].preview).toContain('[HIGHLIGHT]java[/HIGHLIGHT]');
});
```

### 5. **Simplify Testing Workflow**
```bash
# Add npm scripts for quick testing
"scripts": {
  "dev:search": "node dev-cli.js search",
  "dev:extract": "node dev-cli.js extract",
  "test:ui": "node --test tests/ui/*.test.js"
}
```

## Testing Pain Points

1. **Setup Menu Blocking**: Have to navigate through setup menu every time to test search
2. **No Skip Option**: Can't bypass extraction/indexing for UI-only changes  
3. **Long Feedback Loop**: 3+ minutes to test a simple highlighting fix
4. **Import Hell**: Inconsistent module patterns make it hard to create test utilities
5. **Monolithic Design**: Everything coupled together in cli.js makes isolated testing impossible

## Priority Fixes

1. **HIGH**: Extract `showLiveSearch` to standalone module with clean exports
2. **HIGH**: Create test fixtures with pre-built index for instant testing
3. **MEDIUM**: Separate `ClaudeConversationExtractor` into its own module
4. **MEDIUM**: Add development mode that skips setup checks
5. **LOW**: Refactor to consistent ES6 module patterns throughout

## Notes for Future Development

- The search highlighting feature is actually well-implemented in `indexed-search.js`
- The UI rendering in `cli.js` has the right logic but needs testing
- The color schemes are inconsistent between files (need standardization)
- The terminal control code works well but is hard to test without mocks