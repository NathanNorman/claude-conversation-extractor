# Changelog

All notable changes to Claude Conversation Extractor will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.2] - 2025-10-01

### Added
- Enhanced Claude Code context creation with project-aware launchers
- Better handling of missing JSONL files in context creation
- Hook management UI in setup menu with detailed explanations
- /remember command management in setup menu
- Setup menu loop for returning after hook operations
- Conversation sorting by date (newest first) in non-interactive mode
- Executable launcher scripts generated in /tmp for easy access
- Smart project directory detection from .claude/projects structure
- Parse both JSONL and markdown conversation formats

### Changed
- Context files now saved to current directory with launchers in /tmp
- Cleaner conversation count display
- Improved setup workflow - menu shows hook/command status prominently
- Better error handling for missing JSONL files in context creation

### Fixed
- Hook install/uninstall now properly returns to setup menu
- Missing conversation files properly handled in bulk extraction
- Menu navigation for hook operations no longer exits prematurely

## [1.1.1] - 2025-09-30

### Added
- Non-interactive CLI mode for automation (`--search`, `--json`, `--filter-repo`, `--filter-date`)
- Conversation preview pagination in browse mode (500 chars/page with ←→ navigation)
- File size information in non-interactive JSON output
- Better clipboard support for launch commands

### Changed
- Improved JSON output format with file sizes and highlighting
- Enhanced error handling in non-interactive mode

## [1.1.0] - 2025-09-29

### Added
- Index built from exported markdown files for better persistence
- Smart index with incremental updates
- Repository filter system with multi-select support
- Date range filters (13 predefined + custom range)
- Filter menu accessible via Tab key
- Active filter indicators in search UI
- Debug logging system with configurable levels

### Changed
- Search index optimizations for better performance
- Improved filter state management
- Better stdin handling between prompts
- Enhanced search result display with filter context

### Fixed
- Filter menu variable reference bugs (activeFilters, searchTerm)
- Stdin raw mode management between consecutive prompts
- Repository selection properly updates state.activeFilters
- getAllRepos function properly references conversations

## [1.0.0] - 2025-09-27

### Added
- Complete rewrite in JavaScript/Node.js (from Python)
- MiniSearch integration for 25x faster search
- Interactive live search with real-time results
- TF-IDF relevance scoring and fuzzy matching
- Search highlighting with [HIGHLIGHT] markers
- Occurrence navigation (←→ keys to jump between matches)
- Keyboard navigation (↑↓, PgUp/PgDn, Tab, Enter, Esc)
- Multi-select mode (Ctrl+Space)
- Progress-tracked bulk extraction
- Smart filename generation with collision handling
- Comprehensive export system (Markdown, JSON, HTML, Text)
- Setup management with status tracking
- Test suite with 340 tests and 97% coverage
- Index protection in tests (30x performance improvement)
- Pre-commit hooks (ESLint + quick tests)

### Changed
- Primary language: Python → JavaScript
- Search engine: Basic grep → MiniSearch with TF-IDF
- UI: Menu-based → Live interactive search
- Performance: ~500ms → ~20-50ms search times
- Test coverage: ~60% → 97%
- Test count: ~50 → 340 tests
- Test speed: 180s → 6.5s (30x faster)

### Removed
- Python dependencies
- Old menu-based UI
- Basic search implementation

## [0.9.x] - Python Version (Upstream)

Original Python implementation by ZeroSumQuant.

### Features
- Basic conversation extraction
- Menu-driven interface
- Simple search functionality
- Markdown export

---

## Migration Guide: v0.9.x → v1.x

### Breaking Changes

**Installation:**
```bash
# Old (Python)
pip install claude-conversation-extractor

# New (Node.js)
npm install -g claude-conversation-extractor
```

**Command names:**
```bash
# Old
claude-extract

# New (both work)
claude-logs
node src/cli.js
```

**Export location:**
- Old: Various locations
- New: `~/.claude/claude_conversations/` (configurable)

### New Features You'll Love

1. **Interactive Search** - No more menu navigation, just type and see results
2. **Filters** - Press Tab to filter by repo or date
3. **Fast Search** - 25x faster with MiniSearch
4. **Archive Support** - Search old conversations Claude deleted
5. **Auto-Export Hook** - Conversations exported automatically
6. **Non-Interactive Mode** - Perfect for scripts and automation

### Data Compatibility

The new version reads the same `~/.claude/projects/*.jsonl` files. Your existing conversations work without migration.
