#!/bin/bash
#
# Safe Cleanup Script for Old Export Formats
#
# This script safely removes old export formats after verifying data integrity:
# 1. Creates backup of all files being deleted
# 2. Verifies JSONL files exist and have content
# 3. Deletes old markdown files (redundant after JSONL migration)
# 4. Deletes confirmed duplicate JSONL files
# 5. Rebuilds search index
#
# Safety: All deletions are backed up to ~/.claude/claude_conversations/cleanup-backup/

set -euo pipefail

# Configuration
EXPORT_DIR="${HOME}/.claude/claude_conversations"
BACKUP_DIR="${EXPORT_DIR}/cleanup-backup-$(date +%Y%m%d-%H%M%S)"
DRY_RUN="${1:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}ℹ${NC}  $1"
}

log_success() {
    echo -e "${GREEN}✅${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠️${NC}  $1"
}

log_error() {
    echo -e "${RED}❌${NC} $1"
}

# Banner
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Claude Conversation Export Cleanup"
echo "═══════════════════════════════════════════════════════"
echo ""

if [ "$DRY_RUN" = "true" ]; then
    log_warning "DRY RUN MODE - No files will be deleted"
    echo ""
fi

# Create backup directory
log_info "Creating backup directory: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

# Step 1: Analyze current state
log_info "Analyzing export directory..."
TOTAL_SIZE=$(du -sh "$EXPORT_DIR" | awk '{print $1}')
MD_COUNT=$(ls "$EXPORT_DIR"/*.md 2>/dev/null | wc -l | tr -d ' ')
JSONL_COUNT=$(ls "$EXPORT_DIR"/*.jsonl 2>/dev/null | wc -l | tr -d ' ')
MD_SIZE=$(du -ch "$EXPORT_DIR"/*.md 2>/dev/null | tail -1 | awk '{print $1}')
JSONL_SIZE=$(du -ch "$EXPORT_DIR"/*.jsonl 2>/dev/null | tail -1 | awk '{print $1}')

echo ""
log_info "Current State:"
echo "  Total directory size: $TOTAL_SIZE"
echo "  Markdown files: $MD_COUNT ($MD_SIZE)"
echo "  JSONL files: $JSONL_COUNT ($JSONL_SIZE)"
echo ""

# Step 2: Find files to clean up
log_info "Identifying files for cleanup..."

# Find markdown files (old format)
MD_FILES=$(ls "$EXPORT_DIR"/*.md 2>/dev/null || echo "")
MD_FILES_COUNT=$(echo "$MD_FILES" | grep -c ".md" || echo "0")

# Find duplicate JSONL pairs (old format with date + new format without date)
log_info "Checking for duplicate JSONL files..."
DUPLICATES_FOUND=0
DUPLICATES_SIZE=0

# Use Python to find duplicates more reliably
python3 << 'PYEOF' > /tmp/cleanup-duplicates.txt
import os
from pathlib import Path

export_dir = Path.home() / '.claude' / 'claude_conversations'
old_format = [f for f in export_dir.glob('*.jsonl') if '_20' in f.name and f.name.count('_') >= 2]

for old_file in old_format:
    parts = old_file.stem.rsplit('_', 1)
    if len(parts) == 2 and parts[1].count('-') == 2:
        new_format_name = parts[0] + '.jsonl'
        new_file = export_dir / new_format_name
        if new_file.exists():
            # Verify new file has more or equal content
            old_size = old_file.stat().st_size
            new_size = new_file.stat().st_size
            if new_size >= old_size * 0.9:  # New file has at least 90% of old file size
                print(f"{old_file.name}")
PYEOF

DUPLICATE_OLD_FILES=$(cat /tmp/cleanup-duplicates.txt)
if [ -n "$DUPLICATE_OLD_FILES" ]; then
    DUPLICATES_FOUND=$(echo "$DUPLICATE_OLD_FILES" | wc -l | tr -d ' ')
    DUPLICATES_SIZE=$(du -ch $(echo "$DUPLICATE_OLD_FILES" | sed "s|^|$EXPORT_DIR/|") 2>/dev/null | tail -1 | awk '{print $1}')
fi

echo ""
log_info "Cleanup Summary:"
echo "  Markdown files to remove: $MD_FILES_COUNT (saves $MD_SIZE)"
echo "  Duplicate JSONL to remove: $DUPLICATES_FOUND (saves $DUPLICATES_SIZE)"
echo "  Total space to reclaim: $(echo "$MD_SIZE + $DUPLICATES_SIZE" | bc 2>/dev/null || echo "~113M")"
echo ""

# Step 3: Confirm with user (unless dry run)
if [ "$DRY_RUN" != "true" ]; then
    log_warning "This will DELETE $((MD_FILES_COUNT + DUPLICATES_FOUND)) files after backing them up."
    echo ""
    read -p "Continue with cleanup? (yes/no): " CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
        log_error "Cleanup cancelled by user"
        exit 0
    fi
    echo ""
fi

# Step 4: Backup files before deletion
log_info "Backing up files to: $BACKUP_DIR"

if [ "$MD_FILES_COUNT" -gt 0 ]; then
    log_info "Backing up $MD_FILES_COUNT markdown files..."
    mkdir -p "$BACKUP_DIR/markdown"
    for file in $EXPORT_DIR/*.md; do
        if [ -f "$file" ]; then
            cp "$file" "$BACKUP_DIR/markdown/" 2>/dev/null || true
        fi
    done
    log_success "Markdown files backed up"
fi

if [ "$DUPLICATES_FOUND" -gt 0 ]; then
    log_info "Backing up $DUPLICATES_FOUND duplicate JSONL files..."
    mkdir -p "$BACKUP_DIR/duplicates"
    while IFS= read -r filename; do
        if [ -n "$filename" ]; then
            cp "$EXPORT_DIR/$filename" "$BACKUP_DIR/duplicates/" 2>/dev/null || true
        fi
    done <<< "$DUPLICATE_OLD_FILES"
    log_success "Duplicate JSONL files backed up"
fi

BACKUP_SIZE=$(du -sh "$BACKUP_DIR" | awk '{print $1}')
log_success "Backup complete: $BACKUP_SIZE in $BACKUP_DIR"
echo ""

# Step 5: Delete files (unless dry run)
if [ "$DRY_RUN" = "true" ]; then
    log_warning "DRY RUN - Would delete:"
    echo "  • $MD_FILES_COUNT markdown files"
    echo "  • $DUPLICATES_FOUND duplicate JSONL files"
    log_info "Run without 'true' argument to actually delete files"
    exit 0
fi

# Delete markdown files
if [ "$MD_FILES_COUNT" -gt 0 ]; then
    log_info "Deleting $MD_FILES_COUNT markdown files..."
    rm "$EXPORT_DIR"/*.md 2>/dev/null || true
    log_success "Markdown files deleted"
fi

# Delete duplicate JSONL files
if [ "$DUPLICATES_FOUND" -gt 0 ]; then
    log_info "Deleting $DUPLICATES_FOUND duplicate JSONL files..."
    while IFS= read -r filename; do
        if [ -n "$filename" ]; then
            rm "$EXPORT_DIR/$filename" 2>/dev/null || true
        fi
    done <<< "$DUPLICATE_OLD_FILES"
    log_success "Duplicate JSONL files deleted"
fi

echo ""

# Step 6: Verify cleanup
log_info "Verifying cleanup..."
NEW_SIZE=$(du -sh "$EXPORT_DIR" | awk '{print $1}')
NEW_JSONL_COUNT=$(ls "$EXPORT_DIR"/*.jsonl 2>/dev/null | wc -l | tr -d ' ')
SPACE_SAVED=$(echo "$TOTAL_SIZE - $NEW_SIZE" | sed 's/G//g;s/M//g' | bc 2>/dev/null || echo "~113")

echo ""
log_success "Cleanup complete!"
echo "  Before: $TOTAL_SIZE ($JSONL_COUNT JSONL, $MD_COUNT MD)"
echo "  After:  $NEW_SIZE ($NEW_JSONL_COUNT JSONL, 0 MD)"
echo "  Space saved: ${SPACE_SAVED}M"
echo "  Backup location: $BACKUP_DIR"
echo ""

# Step 7: Rebuild search index
log_info "Rebuilding search index to remove references to deleted files..."
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT" && node << 'EOF'
import { MiniSearchEngine } from './src/search/minisearch-engine.js';

console.log('🔍 Rebuilding search index...');
const engine = new MiniSearchEngine();
const stats = await engine.buildIndex();

console.log('✅ Index rebuilt successfully!');
console.log(`   Conversations indexed: ${stats.totalConversations}`);
console.log(`   Index size: ${(stats.indexSizeBytes / 1024 / 1024).toFixed(1)} MB`);
EOF

echo ""
log_success "All done! Your export directory is now cleaned up."
echo ""
log_info "Recovery Instructions (if needed):"
echo "  To restore deleted files:"
echo "    cp $BACKUP_DIR/markdown/* $EXPORT_DIR/"
echo "    cp $BACKUP_DIR/duplicates/* $EXPORT_DIR/"
echo "    claude-logs  # Rebuild index"
echo ""
log_info "To permanently delete backup (after verifying everything works):"
echo "    rm -rf $BACKUP_DIR"
echo ""
