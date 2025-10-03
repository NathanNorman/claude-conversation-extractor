#!/bin/bash
#
# Clean Dated Duplicate Exports
#
# Since we now export without dates in filenames, this script removes
# all old dated duplicates, keeping only the dateless versions.
#
# SAFE: Creates full backup before making any changes

set -euo pipefail

EXPORT_DIR="${HOME}/.claude/claude_conversations"
BACKUP_DIR="${HOME}/.claude/claude_conversations/cleanup-backup-$(date +%Y%m%d-%H%M%S)"
DRY_RUN=false

# Parse arguments
if [ "${1:-}" = "--dry-run" ]; then
    DRY_RUN=true
    echo "🔍 DRY RUN MODE - No changes will be made"
    echo ""
fi

echo "🧹 Cleaning Dated Duplicate Exports"
echo "====================================="
echo ""

# Count current files
total_files=$(ls "$EXPORT_DIR"/*.md 2>/dev/null | wc -l | tr -d ' ')
echo "📊 Current state:"
echo "   Total markdown files: $total_files"
echo ""

# Find all dated files (format: *_YYYY-MM-DD.md)
dated_files=$(ls "$EXPORT_DIR"/*_[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].md 2>/dev/null || true)

if [ -z "$dated_files" ]; then
    echo "✅ No dated files found - nothing to clean"
    exit 0
fi

dated_count=$(echo "$dated_files" | wc -l | tr -d ' ')
echo "🔍 Found $dated_count dated files to clean"
echo ""

# Create backup before making changes
if [ "$DRY_RUN" = false ]; then
    echo "📦 Creating backup..."
    mkdir -p "$BACKUP_DIR"
    cp -r "$EXPORT_DIR"/*.md "$BACKUP_DIR/" 2>/dev/null || true
    echo "   ✅ Backup created at: $BACKUP_DIR"
    echo ""
fi

# Remove dated files
removed=0
skipped=0

echo "🗑️  Removing dated duplicates..."
for file in $dated_files; do
    # Extract session ID from filename
    base=$(basename "$file")
    session_id=$(echo "$base" | sed -E 's/.*_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_.*/\1/')

    # Check if dateless version exists
    project=$(echo "$base" | sed -E "s/_${session_id}_.*//" | tr -cd 'a-zA-Z0-9-_')
    dateless_file="${EXPORT_DIR}/${project}_${session_id}.md"

    if [ -f "$dateless_file" ]; then
        # Dateless version exists - safe to remove dated version
        echo "  🗑️  $(basename $file)"
        removed=$((removed + 1))

        if [ "$DRY_RUN" = false ]; then
            rm "$file"
        fi
    else
        # No dateless version - keep this dated file for now
        echo "  ⚠️  Keep (no dateless version): $(basename $file)"
        skipped=$((skipped + 1))
    fi
done

echo ""
echo "📊 Cleanup Summary:"
echo "   Dated files removed: $removed"
echo "   Dated files kept: $skipped"
echo "   Expected final count: $((total_files - removed))"
echo ""

if [ "$DRY_RUN" = true ]; then
    echo "✅ Dry run complete - no changes made"
    echo "   Run without --dry-run to apply changes"
else
    final_count=$(ls "$EXPORT_DIR"/*.md 2>/dev/null | wc -l | tr -d ' ')
    echo "✅ Cleanup complete!"
    echo "   Files before: $total_files"
    echo "   Files after: $final_count"
    echo "   Removed: $((total_files - final_count))"
    echo ""
    echo "📦 Backup: $BACKUP_DIR"
    echo "   (Delete after verifying: rm -rf \"$BACKUP_DIR\")"
    echo ""
    echo "🔍 Next step: Rebuild search index"
    echo "   npm start → Rebuild Search Index"
fi
