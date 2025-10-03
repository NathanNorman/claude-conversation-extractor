# Migration Guide: Dateless Filenames

## What Changed

The export system now creates files **without dates in filenames** to prevent duplicate exports of the same conversation.

### Before
```
project_abc123_2025-10-01.md
project_abc123_2025-10-02.md  # Same conversation, different day = duplicate!
project_abc123_2025-10-03.md
```

### After
```
project_abc123.md  # One file, always updated
```

## Benefits

- ✅ **No duplicates** - One file per conversation
- ✅ **Correct dates** - File mtime preserved from JSONL
- ✅ **Less clutter** - ~685 files → ~558 files
- ✅ **Simpler management** - Latest version always in same file

## Migration Steps

### Step 1: Update Global Package

```bash
cd ~/claude-conversation-extractor
npm link
```

This updates the background export service with the new code.

### Step 2: Re-export All Conversations

This creates dateless versions of all your conversations:

```bash
npm start
# Select: "📤 Extract All Conversations" or "Extract X New Conversations"
```

**Time:** ~2-3 minutes for 132 conversations

### Step 3: Clean Up Dated Duplicates

```bash
# Preview what will be removed
./scripts/clean-dated-duplicates.sh --dry-run

# Actually clean up (creates backup first)
./scripts/clean-dated-duplicates.sh
```

**Result:**
- Removes ~127 old dated duplicate files
- Keeps all dateless files (newest versions)
- Creates backup at `~/.claude/claude_conversations/cleanup-backup-TIMESTAMP/`

### Step 4: Rebuild Search Index

```bash
npm start
# Select: "🗂️ Rebuild Search Index"
```

This ensures the index uses the new dateless filenames.

### Step 5: Verify

```bash
# Check file count
ls ~/.claude/claude_conversations/*.md | wc -l
# Should show ~558 files (down from ~685)

# Start searching
npm start
# Should show 558-559 searchable conversations
```

## Rollback (If Needed)

If something goes wrong, restore from the backup:

```bash
# The cleanup script creates a timestamped backup
rm ~/.claude/claude_conversations/*.md
cp ~/.claude/claude_conversations/cleanup-backup-TIMESTAMP/*.md ~/.claude/claude_conversations/
npm start  # Rebuild index
```

## Technical Details

**Files Changed:**
- `.claude/hooks/auto-export-conversation.js` - Removes date, preserves mtime
- `src/setup/bulk-extractor.js` - Removes date from filename (3 locations)
- `scripts/clean-dated-duplicates.sh` - New cleanup utility

**Filename Format:**
- Old: `{project}_{sessionId}_{YYYY-MM-DD}.md`
- New: `{project}_{sessionId}.md`

**Date Information:**
- Still stored inside file: `**Date:** 2025-10-03T20:47:01.213Z`
- File mtime: Set to JSONL's mtime (actual conversation date)
- Search results: Use file mtime for display

## Questions?

- Backup location: `~/.claude/claude_conversations/cleanup-backup-*/`
- Logs: `~/.claude/claude_conversations/logs/background-export-*.log`
- Issues: Check background service logs for errors
