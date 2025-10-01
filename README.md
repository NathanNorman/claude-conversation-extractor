# Claude Conversation Extractor

> 🚀 **Search, browse, and export your entire Claude Code conversation history with lightning-fast full-text search**

[![GitHub release](https://img.shields.io/github/v/release/NathanNorman/claude-conversation-extractor)](https://github.com/NathanNorman/claude-conversation-extractor/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-345%20passing-success)](tests/)
[![Coverage](https://img.shields.io/badge/coverage-100%25-success)](tests/)

An advanced Node.js tool for searching, browsing, and exporting Claude Code conversation history. Features **interactive live search**, **auto-export hooks**, and **MiniSearch-powered fuzzy matching** for instant results.

---

## ✨ Key Features

### 🔍 **Interactive Live Search**
- **Real-time search** with 150ms debouncing for instant results
- **MiniSearch integration** with TF-IDF relevance scoring and fuzzy matching
- **Lightning-fast search** - typically under 50ms even for large conversation histories
- **Keyboard navigation** with arrow keys, page up/down, and occurrence jumping
- **Word highlighting** in search results with `[HIGHLIGHT]` markers
- **Filter by repository** or **date range** for precision searching

### 📦 **Comprehensive Export System**
- **Multiple formats**: Markdown (default), JSON, HTML, plain text
- **Detailed mode** includes tool use, MCP responses, and system messages
- **Bulk extraction** with progress tracking
- **Smart filename generation** with automatic collision handling
- **Idempotent exports** - safely re-run without duplicates

### 🎯 **Advanced Features**
- **Auto-export hook** - automatically export conversations when Claude Code sessions end
- **/remember command** - search past conversations from within Claude Code
- **Claude Code context** - generate launcher scripts that open Claude in the correct project with conversation context
- **Non-interactive CLI** - perfect for automation and scripts

### ⚡ **Performance & Reliability**
- **100% line coverage** with 345 passing tests (22 test suites)
- **30x faster test suite** (180s → 6s) with index protection
- **Smart indexing** - incremental updates for new conversations, full rebuild for large changes
- **Graceful error handling** with empty conversation detection

---

## 📦 Installation

### Install from GitHub (Recommended)

```bash
# Clone the repository
git clone https://github.com/NathanNorman/claude-conversation-extractor.git
cd claude-conversation-extractor

# Install dependencies
npm install

# Run the interactive interface
npm start

# Or use the CLI directly
node src/cli.js
```

**Note:** This package is not published to npm. Install directly from GitHub as shown above.

### Link for Global Usage (Optional)

```bash
# From the project directory, create a global link
npm link

# Now you can run from anywhere:
claude-logs
```

---

## 🚀 Quick Start

### Interactive Mode (Recommended)

```bash
# Launch interactive search interface
claude-logs

# Or using npm
npm start
```

**First-time setup:**
1. Tool detects your Claude Code conversations in `~/.claude/projects/`
2. One-time extraction to markdown (~2 minutes for 150 conversations)
3. Index building for fast search (~30 seconds)
4. Ready to search! 🎉

### Non-Interactive Mode

Perfect for automation, scripts, or integration with other tools:

```bash
# Search and output JSON
claude-logs --search "error handling" --json

# Search with filters
claude-logs --search "API" --filter-repo "my-api-project" --limit 10

# List all conversations sorted by date
claude-logs --json --limit 20

# Filter by date
claude-logs --search "deployment" --filter-date "lastweek"
```

**Output format:**
```json
{
  "query": "error handling",
  "totalResults": 15,
  "filters": {
    "repos": ["my-api-project"],
    "dateRange": null
  },
  "results": [
    {
      "fileName": "my-api-project_abc123_2025-10-01.md",
      "filePath": "/Users/you/.claude/claude_conversations/my-api-project_abc123_2025-10-01.md",
      "fileSize": 45678,
      "fileSizeKB": "44.6",
      "project": "my-api-project",
      "modified": "2025-10-01T14:30:00.000Z",
      "preview": "...discussing error handling strategies...",
      "relevance": 0.89,
      "matches": 12,
      "highlightedPreview": "...discussing [HIGHLIGHT]error[/HIGHLIGHT] [HIGHLIGHT]handling[/HIGHLIGHT] strategies..."
    }
  ]
}
```

---

## 🎮 Interactive Features

### Live Search Interface

```
┌──────────────────────────────────────────────────────┐
│          🔍 Interactive Conversation Search           │
└──────────────────────────────────────────────────────┘
✅ Found 150 conversations

  No filters active [Press Tab to filter]

┌─ Search ─────────────────────────────────────────────┐
│ 🔍 Type to search: error handling                    │
└──────────────────────────────────────────────────────┘

📋 15 matches found in 23ms:

▶ 2 hours ago │ my-api-project │ 89%
    ┌─ Context: Match 1/12 [←→ navigate]
    │ ...discussing [HIGHLIGHT]error[/HIGHLIGHT] [HIGHLIGHT]handling[/HIGHLIGHT]
    │ strategies for the deployment pipeline...
    └─

  Yesterday │ web-app │ 76%
  3 days ago │ data-pipeline │ 65%

[↑↓] Navigate  [←→] Switch matches  [Tab] Filter  [Enter] Select  [Esc] Clear/Exit
```

**Keyboard Shortcuts:**
- **↑↓** - Navigate results
- **←→** - Jump between search occurrences within a conversation
- **PgUp/PgDn** - Page through results
- **Tab** - Open filter menu (repository or date filters)
- **Space** - Select item (in multi-select mode)
- **Ctrl+Space** - Toggle multi-select mode
- **Enter** - Open selected conversation
- **Esc** - Clear search or exit
- **Ctrl+C** - Exit immediately

### Filter System

**Repository Filter:**
- Filter conversations by project name
- Multi-select support
- Preserves selections when reopening

**Date Range Filter:**
- 13 predefined ranges: Today, Yesterday, Last Week, Last Month, etc.
- Custom date range with flexible input formats
- Formats: YYYY-MM-DD, MM/DD/YYYY, natural language

---

## 📋 Conversation Actions

When you select a conversation, choose from:

### 📤 Export Options
- **Export to Markdown** - Clean, readable format
- **Export to JSON** - Structured data with metadata
- **Export to HTML** - Web-viewable with syntax highlighting

### 📝 Claude Code Integration
- **Create Claude Code context** - Generate a markdown file with conversation history
- **Auto-generate launcher script** - Shell script that:
  - Changes to the correct project directory
  - Launches Claude Code
  - Automatically loads the conversation context
- **Smart project detection** - Finds the correct directory from `.claude/projects` structure

### 📋 Utilities
- **Copy file path** - Quick clipboard copy
- **Show file location** - Display full path
- **Browse preview** - Paginate through long conversations (500 chars/page)

---

## 🔧 Setup & Configuration

### One-Time Setup

When you first run the tool, you'll see the setup menu:

```
╭────────────────────────────────────────────────────────╮
│                                                        │
│   CLAUDE CONVERSATION EXTRACTOR - SETUP STATUS        │
│                                                        │
│   📊 Current Status:                                   │
│     📚 Searchable Conversations: 150 total            │
│     🗂️  ✅ Search Index: Built                        │
│     📁 Export Location: ~/.claude/claude_conversations │
│     ⚡ Search Index: ✅ Ready (fast search)           │
│     🔗 ✅ Auto-Export Hook: Installed                 │
│     ⚡ ✅ /remember Command: Installed                │
│                                                        │
╰────────────────────────────────────────────────────────╯

? What would you like to do?
  🔍 Start Searching (everything is ready!)
  ─────── Advanced Options ───────
  📁 Change Export Location
  🔗 Uninstall Auto-Export Hook
  ⚡ Uninstall /remember Command
  📊 View Conversation Analytics
❯ ❌ Exit
```

**Setup Steps:**
1. **Extract conversations** - Converts JSONL to markdown (~2 min for 150 conversations)
2. **Build search index** - Creates MiniSearch index (~30 seconds)
3. **Optional: Install hooks** - Auto-export and /remember command

### Auto-Export Hook

Automatically export conversations when Claude Code sessions end:

**What it does:**
- Triggers on `SessionEnd` event (when you exit Claude Code)
- Reads the conversation JSONL file
- Converts to clean markdown
- Saves to configured export directory

**Installation:**
```bash
# From setup menu, select "Install Auto-Export Hook"
# Or manually add to ~/.claude/settings.json
```

**Technical details:**
- Hook added to `~/.claude/settings.json`
- Script: `.claude/hooks/auto-export-conversation.js`
- Timeout: 10 seconds (non-blocking)
- Requires: Node.js (already installed)

### /remember Command

Search past conversations from within Claude Code:

**How to use:**
```
/remember when we discussed API authentication?
/remember database schema design from last week
/remember what did I work on yesterday?
```

**How it works:**
- Installed as Claude Code slash command
- Claude reads your query and searches conversation history
- Uses claude-logs programmatically to find matches
- Returns relevant conversations or asks for clarification

**Installation:**
```bash
# From setup menu, select "Install /remember Command"
# Restart Claude Code for changes to take effect
```

---

## 🎯 Advanced Usage

### Export Formats

**Markdown (Default)**
```bash
# Clean, readable format
claude-logs
# Select conversation → Export to markdown
```

**JSON**
```javascript
{
  "messages": [
    {
      "role": "user",
      "content": "How do I implement error handling?",
      "timestamp": "2025-10-01T14:30:00Z"
    },
    {
      "role": "assistant",
      "content": "Here's how to implement error handling...",
      "timestamp": "2025-10-01T14:30:05Z"
    }
  ],
  "metadata": {
    "exportedOn": "2025-10-01T15:00:00Z",
    "messageCount": 42
  }
}
```

**HTML**
- Styled with dark/light theme support
- Syntax highlighting for code blocks
- Print-friendly CSS
- Navigation for long conversations

### Search Query Syntax

**Exact phrases:**
```bash
"error handling"     # Finds exact phrase
```

**Boolean operators:**
```bash
API AND authentication     # Both terms required
javascript OR typescript   # Either term matches
deployment NOT production  # Exclude term
```

**Fuzzy matching:**
```bash
deplyment~    # Finds "deployment" even with typo
```

**Field-specific search:**
```bash
project:my-api-project    # Search in project name
```

### Date Range Filters

**Predefined ranges:**
- Today, Yesterday
- Last 24 hours, Last 3/7/14 days
- Last month, Last 3/6 months
- This week, This month, This year

**Custom range:**
```
From: 2025-09-01
To: 2025-09-30
```

**Supported formats:**
- YYYY-MM-DD
- MM/DD/YYYY
- MM-DD-YYYY
- Natural language (handled by dayjs)

---

## 🛠️ Development

### Project Structure

```
src/
  cli.js                    # Main interactive interface (2,598 lines)
  export/
    export-manager.js       # Coordinates multi-format exports
    markdown-exporter.js    # Clean markdown generation
    json-exporter.js        # JSON/JSONL export with streaming
    html-exporter.js        # Styled HTML with syntax highlighting
    text-exporter.js        # Plain text export
  search/
    minisearch-engine.js    # Primary search with TF-IDF + fuzzy match
    indexed-search.js       # Legacy fallback (being phased out)
  setup/
    setup-manager.js        # Configuration and status tracking
    setup-menu.js           # Interactive setup UI
    bulk-extractor.js       # Progress-tracked bulk extraction
    index-builder.js        # Search index creation
    hook-manager.js         # SessionEnd hook management
    command-manager.js      # Slash command management
  utils/
    date-filters.js         # 13 date range filters
    logger.js               # Configurable logging system

tests/                      # 21 test suites, 340 tests
  cli/                      # CLI interaction tests
  export/                   # Export functionality tests
  integration/              # End-to-end integration tests
  search/                   # Search and indexing tests
  setup/                    # Setup workflow tests
```

### Build Commands

```bash
# Install dependencies
npm install

# Run interactive UI
npm start

# Run tests
npm test                  # Full suite with index protection
npm run test:quick        # Basic tests only
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage report

# Linting
npm run lint              # Check for issues
npm run lint:fix          # Auto-fix issues

# Development
npm run dev               # Same as npm start
```

### Testing Strategy

- **345 tests** organized in 22 test suites
- **100% line coverage** across core functionality
- **Integration tests** for end-to-end validation (not just mocked units)
- **Index protection** prevents tests from overwriting production index
- **Fixture-based** testing with mock conversation data
- **Integration tests** for complete workflows
- **30x performance improvement** (180s → 6s) with optimized test setup

### Git Workflow

**Pre-commit hooks automatically run:**
- ESLint validation
- Quick test suite (31 tests, ~0.4s)
- Format verification

**Commit with hooks:**
```bash
git add .
git commit -m "feat: Add new search feature"
# ✅ Linting passed
# ✅ Tests passed
```

---

## 📁 Data Storage

### Claude Code Conversation Locations

**Source files (JSONL):**
```
~/.claude/projects/
  -Users-nathan-norman-project-name/
    abc12345-6789-abcd-ef01-234567890abc.jsonl
```

**Exported files (Markdown):**
```
~/.claude/claude_conversations/
  project-name_abc12345_2025-10-01.md
```

**Search index:**
```
~/.claude/claude_conversations/
  search-index-v2.json         # MiniSearch index
  setup.json                    # Setup configuration
  debug.log                     # Debug logs (if enabled)
  logging.json                  # Logging configuration
```

### Configuration Files

**Setup configuration** (`~/.claude/claude_conversations/setup.json`):
```json
{
  "version": "2.0",
  "setupComplete": true,
  "extractedAll": true,
  "extractedCount": 150,
  "indexBuilt": true,
  "conversationsIndexed": 150,
  "exportLocation": "/Users/you/.claude/claude_conversations",
  "searchPreferences": {
    "minRelevanceThreshold": 0.05,
    "maxResults": 20,
    "enableWordHighlighting": true,
    "contextWords": 35
  }
}
```

**Auto-export hook** (`~/.claude/settings.json`):
```json
{
  "hooks": {
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"/path/to/auto-export-conversation.js\"",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

**Slash command** (`~/.claude/settings.json`):
```json
{
  "slashCommands": {
    "remember": {
      "command": "node \"/path/to/remember.js\"",
      "description": "Search previous conversations using natural language",
      "timeout": 30
    }
  }
}
```

---

## 🔍 Search Features Deep Dive

### MiniSearch Integration

**Features:**
- **TF-IDF relevance scoring** - Better ranking than simple keyword matching
- **Fuzzy matching** - Find "deployment" even when you type "deplyment"
- **Prefix search** - Type-as-you-go search suggestions
- **Boolean operators** - AND, OR, NOT for complex queries
- **Field boosting** - Project name matches ranked higher

**Performance:**
- Typically under 50ms search time
- Handles large conversation histories effortlessly
- Incremental index updates for new conversations
- Smart rebuild detection (full vs. incremental)

### Search Index Architecture

**Search index structure:**
```javascript
{
  "version": "2.0",
  "buildDate": "2025-10-01T14:00:00Z",
  "miniSearchData": {
    // MiniSearch index data with TF-IDF vectors
  },
  "conversationData": [
    ["sessionId", {
      "project": "my-api-project",
      "exportedFile": "/path/to/export.md",
      "modified": "2025-10-01T12:00:00Z",
      "fullText": "...",  // Full conversation text for instant highlighting
      "preview": "First 200 chars...",
      "wordCount": 1523,
      "messageCount": 42
    }]
  ],
  "stats": {
    "totalDocuments": 150,
    "totalConversations": 150,
    "indexedAt": "2025-10-01T14:00:00Z"
  }
}
```

---

## 🎨 Use Cases

### 1. Find That Solution from Last Week

```bash
claude-logs
# Type: "lambda deployment error"
# Navigate to result → View conversation → Copy context
```

### 2. Create Documentation from Conversations

```bash
# Export to HTML for sharing
claude-logs --search "API design" --format html
```

### 3. Resume Work in Claude Code

```bash
# Select conversation → "Create Claude Code context"
# Generates launcher that opens Claude in correct project with context
/tmp/launch-context-project-2025-10-01.sh
```

### 4. Automation & Scripts

```javascript
// Use as library
import { MiniSearchEngine, ExportManager } from 'claude-conversation-extractor';

const engine = new MiniSearchEngine();
await engine.loadIndex();

const results = await engine.search('error handling');
console.log(`Found ${results.totalFound} conversations in ${results.searchTime}ms`);
```

### 5. Daily Standup Reports

```bash
# Find yesterday's work
claude-logs --filter-date yesterday --json | jq '.results[].project'
```

---

## 🐛 Troubleshooting

### No conversations found

**Check if Claude Code has been used:**
```bash
ls -la ~/.claude/projects/
# Should show directories with .jsonl files
```

**Verify permissions:**
```bash
chmod -R u+r ~/.claude/projects/
```

### Search index outdated

**Rebuild manually:**
```bash
claude-logs
# Select "Rebuild Search Index" from setup menu
```

**Or delete and rebuild:**
```bash
rm ~/.claude/claude_conversations/search-index-v2.json
claude-logs
# Will rebuild automatically
```

### Empty conversations error

The tool detects empty conversations and offers to:
- **Keep** - Leave the JSONL file alone
- **Delete** - Remove this empty conversation
- **Delete All** - Auto-delete all future empty conversations

### Performance issues

**Index is stale:**
```bash
# Tool auto-detects and offers smart update
# Incremental: Only processes new files (fast)
# Full rebuild: Rebuilds entire index (when >20% changed)
```

**Too many conversations:**
```bash
# Use filters to narrow results
# Tab → Filter by Repository
# Tab → Filter by Date Range
```

---

## 📈 Performance Benchmarks

| Operation | Time | Details |
|-----------|------|---------|
| Search (indexed) | 20-50ms | TF-IDF with fuzzy match |
| Search (non-indexed) | ~500ms | Direct JSONL reading |
| Index build | ~30s | For ~150 conversations |
| Bulk extraction | ~2min | 150 conversations to markdown |
| Smart update | 2-5s | Incremental for <20% new files |
| Test suite | 6.5s | 340 tests (30x faster than v1.0) |

---

## 🤝 Contributing

Contributions welcome! This is a **complete rewrite** from the original Python version.

**Major changes from upstream:**
- ✅ Rewritten in JavaScript/Node.js (was Python)
- ✅ MiniSearch integration for 25x faster search
- ✅ Interactive live search UI
- ✅ Auto-export hooks and slash commands
- ✅ Non-interactive CLI mode
- ✅ 340 test suite (was ~50 tests)
- ✅ 100% test coverage (was ~60%)

**Development setup:**
```bash
git clone https://github.com/NathanNorman/claude-conversation-extractor.git
cd claude-conversation-extractor
npm install
npm test
```

**Running tests:**
```bash
npm test              # Full suite with protection
npm run test:quick    # Fast subset
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
```

---

## 📜 Version History

See [CHANGELOG.md](CHANGELOG.md) for detailed version history.

**Latest: v1.1.2**
- Enhanced Claude Code context with project-aware launchers
- Hook and /remember command management in setup
- Improved setup workflow with menu loop
- Sorted conversations by date in non-interactive mode
- Better project directory detection

---

## 🔒 Privacy & Security

- ✅ **100% local** - Never sends your conversations anywhere
- ✅ **No internet required** - Works completely offline
- ✅ **No telemetry** - Zero tracking or analytics
- ✅ **Open source** - Audit the code yourself
- ✅ **Read-only operations** - Never modifies Claude Code source files
- ✅ **Input sanitization** - Protection against injection attacks

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- Original concept from [ZeroSumQuant/claude-conversation-extractor](https://github.com/ZeroSumQuant/claude-conversation-extractor)
- Completely rewritten in JavaScript with substantial enhancements
- Built with [MiniSearch](https://github.com/lucaong/minisearch) for fast full-text search

---

## 📞 Support

**Issues:** [GitHub Issues](https://github.com/NathanNorman/claude-conversation-extractor/issues)

**Questions:** Check the interactive help (F1) or browse the [source code](src/)

---

**Keywords**: claude code conversations, export claude code, search claude history, claude conversation extractor, backup claude sessions, claude code logs, ~/.claude/projects, claude jsonl export, claude code export tool, save claude conversations

**Note**: This is an independent tool for Claude Code. Not affiliated with Anthropic.
