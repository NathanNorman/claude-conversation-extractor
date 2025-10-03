#!/bin/bash
#
# Migration Script: Remove Dated Duplicates
#
# This script finds all conversations with multiple dated exports and keeps
# only the newest version with a dateless filename.
#
# SAFE: Creates full backup before making any changes

set -euo pipefail

EXPORT_DIR="${HOME}/.claude/claude_conversations"
BACKUP_DIR="${HOME}/.claude/claude_conversations/migration-backup-$(date +%Y%m%d-%H%M%S)"
DRY_RUN=false

# Parse arguments
if [ "${1:-}" = "--dry-run" ]; then
    DRY_RUN=true
    echo "🔍 DRY RUN MODE - No changes will be made"
fi

echo "🔧 Duplicate Dated Export Migration"
echo "===================================="
echo ""

# Create backup
if [ "$DRY_RUN" = false ]; then
    echo "📦 Creating full backup at:"
    echo "   $BACKUP_DIR"
    mkdir -p "$BACKUP_DIR"
    cp -r "$EXPORT_DIR"/*.md "$BACKUP_DIR/" 2>/dev/null || true
    backup_count=$(ls "$BACKUP_DIR" | wc -l | tr -d ' ')
    echo "   ✅ Backed up $backup_count files"
    echo ""
fi

# Find all unique session IDs
echo "🔍 Scanning for duplicate exports..."
session_ids=$(ls "$EXPORT_DIR"/*.md 2>/dev/null | \
    sed 's/.*_\([0-9a-f-]*\)_\?[0-9-]*\.md/\1/' | \
    sed 's/.*_\([0-9a-f-]*\)\.md/\1/' | \
    sort -u)

duplicates_found=0
files_to_remove=0
files_to_rename=0

for session_id in $session_ids; do
    # Find all files for this session ID (must match exactly to avoid partial matches)
    files=$(ls "$EXPORT_DIR"/*_${session_id}.md "$EXPORT_DIR"/*_${session_id}_*.md 2>/dev/null || true)

    if [ -z "$files" ]; then
        continue
    fi

    # Count files
    file_count=$(echo "$files" | wc -l | tr -d ' ')

    if [ "$file_count" -gt 1 ]; then
        duplicates_found=$((duplicates_found + 1))

        # Separate dated from dateless files
        dated_files=$(echo "$files" | grep "_[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}\.md$" || true)
        dateless_file=$(echo "$files" | grep -v "_[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}\.md$" || true)

        if [ -n "$dateless_file" ]; then
            # Dateless file already exists - just remove all dated versions
            for old_file in $dated_files; do
                [ -z "$old_file" ] && continue
                echo "  🗑️  Remove dated: $(basename $old_file)"
                files_to_remove=$((files_to_remove + 1))

                if [ "$DRY_RUN" = false ]; then
                    rm "$old_file"
                fi
            done
        elif [ -n "$dated_files" ]; then
            # No dateless file - keep newest dated file and rename it
            newest_dated=$(echo "$dated_files" | xargs ls -t 2>/dev/null | head -1)

            if [ -n "$newest_dated" ]; then
                # Extract project name
                base=$(basename "$newest_dated")
                project=$(echo "$base" | sed "s/_${session_id}_.*//")
                target_file="${EXPORT_DIR}/${project}_${session_id}.md"

                echo "  ✏️  Rename: $(basename $newest_dated) → $(basename $target_file)"
                files_to_rename=$((files_to_rename + 1))

                if [ "$DRY_RUN" = false ]; then
                    mv "$newest_dated" "$target_file"
                fi

                # Remove all other dated files
                other_dated=$(echo "$dated_files" | grep -v "$newest_dated" || true)
                for old_file in $other_dated; do
                    [ -z "$old_file" ] && continue
                    echo "  🗑️  Remove old: $(basename $old_file)"
                    files_to_remove=$((files_to_remove + 1))

                    if [ "$DRY_RUN" = false ]; then
                        rm "$old_file"
                    fi
                done
            fi
        fi
    fi
done

echo ""
echo "📊 Migration Summary:"
echo "   Conversations with duplicates: $duplicates_found"
echo "   Files to rename: $files_to_rename"
echo "   Files to remove: $files_to_remove"
echo ""

if [ "$DRY_RUN" = true ]; then
    echo "✅ Dry run complete - no changes made"
    echo "   Run without --dry-run to apply changes"
else
    echo "✅ Migration complete!"
    echo ""
    echo "📦 Backup location: $BACKUP_DIR"
    echo "   (You can delete this after verifying everything works)"
    echo ""
    echo "🔍 Next steps:"
    echo "   1. Rebuild search index: npm start → Rebuild Search Index"
    echo "   2. Verify search works correctly"
    echo "   3. Delete backup if satisfied: rm -rf \"$BACKUP_DIR\""
fi
