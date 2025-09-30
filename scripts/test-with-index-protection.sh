#!/bin/bash
# Protect the production search index during tests

PRODUCTION_INDEX="$HOME/.claude/claude_conversations/search-index-v2.json"
BACKUP_INDEX="$HOME/.claude/claude_conversations/search-index-v2-TESTING-BACKUP.json"

# Backup production index
if [ -f "$PRODUCTION_INDEX" ]; then
  echo "🔒 Backing up production index..."
  cp "$PRODUCTION_INDEX" "$BACKUP_INDEX"
fi

# Run tests directly with jest (avoid recursive npm test call)
echo "🧪 Running tests..."
node --experimental-vm-modules node_modules/.bin/jest "$@"
TEST_EXIT_CODE=$?

# Restore production index
if [ -f "$BACKUP_INDEX" ]; then
  echo "🔓 Restoring production index..."
  mv "$BACKUP_INDEX" "$PRODUCTION_INDEX"
fi

exit $TEST_EXIT_CODE