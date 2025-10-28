#!/bin/bash
#
# Search Index Update Script - Updates search index every 15 minutes
#
# This script runs independently from exports to avoid blocking the fast
# per-minute export job. It loads the full index and updates it with any
# new or modified conversations.

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="${HOME}/.claude/claude_conversations/logs"
TIMING_LOG="${LOG_DIR}/index-update-timing.log"
STATS_LOG="${LOG_DIR}/index-update-stats.log"
EXPORT_DIR="${HOME}/.claude/claude_conversations"

# Create log directory if needed
mkdir -p "$LOG_DIR"

# Timing utilities
START_TIME=$(date +%s%N)
LAST_CHECKPOINT=$START_TIME

log_timing() {
    local label="$1"
    local now=$(date +%s%N)
    local elapsed_ns=$((now - LAST_CHECKPOINT))
    local total_ns=$((now - START_TIME))
    local elapsed_ms=$((elapsed_ns / 1000000))
    local total_ms=$((total_ns / 1000000))

    echo "[$(date -Iseconds)] ${label}: ${elapsed_ms}ms (total: ${total_ms}ms)" >> "$TIMING_LOG"
    LAST_CHECKPOINT=$now
}

log_stats() {
    local message="$1"
    echo "[$(date -Iseconds)] $message" >> "$STATS_LOG"
}

# Get memory usage (macOS)
get_memory_mb() {
    ps -o rss= -p $$ | awk '{print $1/1024}'
}

# Start timing
log_timing "START"
INITIAL_MEM=$(get_memory_mb)
log_stats "Starting search index update"

# Run the index update via Node.js
log_timing "Running index update"

# Create a temporary Node.js script to update the index
cd "$PROJECT_ROOT" && node <<'EOF'
import { join } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = process.cwd();
const exportDir = join(homedir(), '.claude', 'claude_conversations');

// Dynamically import MiniSearchEngine
const { MiniSearchEngine } = await import(join(projectRoot, 'src', 'search', 'minisearch-engine.js'));

console.log('🔍 Initializing search index engine...');
const miniSearch = new MiniSearchEngine({ exportDir });

// Load existing index
console.log('📖 Loading search index...');
const loaded = await miniSearch.loadIndex();

if (!loaded) {
  console.log('⚠️  No search index found - building from scratch...');
  const stats = await miniSearch.buildIndex();
  console.log(`✅ Built search index: ${stats.totalConversations} conversations indexed`);
  process.exit(0);
}

// Update index with new/modified conversations
console.log('🔄 Checking for updates...');
const stats = await miniSearch.updateIndex();

if (stats.newFiles > 0 || stats.updatedFiles > 0) {
  console.log(`📝 Saving updated index...`);
  await miniSearch.saveIndex();
  console.log(`✅ Index updated: +${stats.newFiles} new, ~${stats.updatedFiles} updated, ${stats.totalConversations} total`);
} else {
  console.log(`✅ Index is up to date (${stats.totalConversations} conversations)`);
}

process.exit(0);
EOF

UPDATE_EXIT_CODE=$?
log_timing "Index update complete"

# Final statistics
FINAL_MEM=$(get_memory_mb)
MEM_DELTA=$(echo "$FINAL_MEM - $INITIAL_MEM" | bc)
TOTAL_TIME=$((($(date +%s%N) - START_TIME) / 1000000))

log_timing "COMPLETE"

# Summary log entry
log_stats "=== UPDATE SUMMARY ==="
log_stats "Total time: ${TOTAL_TIME}ms"
log_stats "Memory: ${INITIAL_MEM}MB -> ${FINAL_MEM}MB (delta: ${MEM_DELTA}MB)"
log_stats "Exit code: $UPDATE_EXIT_CODE"

if [ "$UPDATE_EXIT_CODE" -eq 0 ]; then
    log_stats "Status: SUCCESS"
else
    log_stats "Status: FAILED"
fi

exit $UPDATE_EXIT_CODE
