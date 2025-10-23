# Resume Session Feature

## Overview
Added ability to resume Claude Code sessions directly from the conversation browser.

## What Changed

### 1. Session ID Extraction
- Extracts UUID session IDs from conversation file paths
- Handles both JSONL and markdown export paths
- Regex pattern: `/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i`

### 2. New Menu Option
When you select a conversation, you'll see:
```
📄 Conversation Details

Project: claude-conversation-extractor
File: 6332f742-97f3-47b2-ad9b-fefae2f63e68.jsonl
Modified: 10/22/2025, 9:42:20 PM
Size: 45.2 KB

What would you like to do?
  🔄 Resume session in Claude Code  <-- NEW!
  📤 Export to markdown
  📋 Copy file path
  📂 Show file location
  📝 Create Claude Code context
  ─────────────
  🔙 Back to search
  🚪 Exit
```

### 3. Resume Session Dialog
When selected, displays:
```
🔄 Resume Claude Code Session

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Project:
  claude-conversation-extractor

Session ID:
  6332f742-97f3-47b2-ad9b-fefae2f63e68

Command to resume:
  claude --resume 6332f742-97f3-47b2-ad9b-fefae2f63e68

✅ Command copied to clipboard!

Paste and run in your terminal to resume this session.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This will continue the actual Claude Code session
with all previous context and conversation history.

Press Enter to return to menu...
```

## Technical Implementation

### Files Modified
- `src/cli.js`: Added session ID extraction and resume menu option

### Files Added
- `tests/cli/session-id-extraction.test.js`: Comprehensive tests for session ID extraction

### Code Changes
```javascript
// Extract session ID from conversation path
let sessionId = null;
const conversationPath = conversation.path || conversation.originalPath;

if (conversationPath) {
  const filenameMatch = conversationPath.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  if (filenameMatch) {
    sessionId = filenameMatch[1];
  }
}

// Menu option (disabled if no session ID found)
{ name: '🔄 Resume session in Claude Code', value: 'resume', disabled: !sessionId }
```

## Testing

### Unit Tests (9 tests, all passing)
✅ Extract from JSONL path
✅ Extract from markdown export path
✅ Handle path without session ID
✅ Handle null/undefined paths
✅ Handle multiple UUIDs in path
✅ Case-insensitive matching
✅ UUID format validation
✅ Conversation object structure
✅ Fallback to originalPath

### Test Results
```
PASS tests/cli/session-id-extraction.test.js
  Session ID Extraction for Resume Feature
    ✓ should extract session ID from JSONL path
    ✓ should extract session ID from markdown export path
    ✓ should handle path without session ID
    ✓ should handle null/undefined paths
    ✓ should extract correct session ID when multiple UUIDs in path
    ✓ should be case-insensitive for hex characters
    ✓ should validate UUID format (8-4-4-4-12 hex characters)
    ✓ should work with conversation object structure
    ✓ should fallback to originalPath if path is undefined

Test Suites: 1 passed, 1 total
Tests:       9 passed, 9 total
```

### Full Test Suite
```
Test Suites: 1 failed (pre-existing), 34 passed, 35 total
Tests:       1 failed (pre-existing), 566 passed, 567 total
```

### Linter
```
✅ No errors, no warnings
```

## Usage

1. Run the conversation browser:
   ```bash
   claude-start
   # or
   npm start
   ```

2. Search for and select a conversation

3. Choose "🔄 Resume session in Claude Code"

4. The command is automatically copied to your clipboard

5. Paste and run: `claude --resume <session-id>`

## Difference from "Create Context"

| Feature | Resume Session | Create Context |
|---------|---------------|----------------|
| Type | Continues real session | Creates new session |
| History | Full conversation state | Markdown reference |
| Command | `claude --resume <id>` | Custom launcher script |
| Use Case | Pick up where you left off | Reference previous work |

## Edge Cases Handled

- ✅ Missing session ID → Option disabled in menu
- ✅ Multiple UUIDs in path → Extracts first match
- ✅ Archived conversations → Works with both JSONL and markdown paths
- ✅ Clipboard failure → Still shows command to copy manually
- ✅ Case insensitive → Handles uppercase/lowercase hex chars
- ✅ Null/undefined paths → Gracefully returns null

## Future Enhancements

Possible improvements:
- [ ] Auto-detect project directory and `cd` before resuming
- [ ] Show session age/last activity time
- [ ] Batch resume multiple sessions
- [ ] Integration with `claude` CLI to verify session still exists
