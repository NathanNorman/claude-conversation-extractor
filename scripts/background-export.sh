#!/bin/bash
#
# Background Export Script - Exports active Claude conversations every minute
#
# This script is designed to be lightweight and run frequently:
# - Only processes files modified since last run
# - Incremental search index updates
# - Comprehensive timing and resource monitoring
# - Logs performance metrics for analysis

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="${HOME}/.claude/claude_conversations/logs"
TIMING_LOG="${LOG_DIR}/background-export-timing.log"
STATS_LOG="${LOG_DIR}/background-export-stats.log"
PROJECTS_DIR="${HOME}/.claude/projects"
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

# Find active conversation files (modified in last 2 minutes)
log_timing "Checking for active conversations"
ACTIVE_FILES=$(find "$PROJECTS_DIR" -name "*.jsonl" -type f -mmin -2 2>/dev/null || true)
if [ -z "$ACTIVE_FILES" ]; then
    ACTIVE_COUNT=0
else
    ACTIVE_COUNT=$(echo "$ACTIVE_FILES" | wc -l | tr -d ' ')
fi

log_stats "Found $ACTIVE_COUNT active conversation(s)"

if [ "$ACTIVE_COUNT" -eq 0 ]; then
    log_timing "EXIT - No active conversations"
    log_stats "No work needed - conversations idle"

    # Log quick exit stats
    FINAL_MEM=$(get_memory_mb)
    TOTAL_TIME=$((($(date +%s%N) - START_TIME) / 1000000))
    log_stats "Quick exit: ${TOTAL_TIME}ms, memory: ${INITIAL_MEM}MB -> ${FINAL_MEM}MB"
    exit 0
fi

# Export each active conversation
EXPORTED_COUNT=0
SKIPPED_COUNT=0
ERROR_COUNT=0

log_timing "Starting export process"

while IFS= read -r jsonl_path; do
    [ -z "$jsonl_path" ] && continue

    # Extract session info
    session_id=$(basename "$jsonl_path" .jsonl)
    project_dir=$(dirname "$jsonl_path")
    project_name=$(basename "$project_dir")

    log_stats "Processing: $project_name / $session_id"

    # Check if already exported (JSONL archive exists and is up to date)
    file_date=$(date -r "$jsonl_path" "+%Y-%m-%d")
    export_pattern="${EXPORT_DIR}/${project_name}_${session_id}.jsonl"

    # Check if export exists and is recent
    NEEDS_EXPORT=true
    if [ -f "$export_pattern" ]; then
        latest_export="$export_pattern"
        if [ -n "$latest_export" ]; then
            export_mtime=$(stat -f %m "$latest_export" 2>/dev/null || echo "0")
            jsonl_mtime=$(stat -f %m "$jsonl_path" 2>/dev/null || echo "0")

            if [ "$export_mtime" -ge "$jsonl_mtime" ]; then
                NEEDS_EXPORT=false
                log_stats "  → Already up to date, skipping"
                SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
            fi
        fi
    fi

    if [ "$NEEDS_EXPORT" = true ]; then
        # Run the export via Node.js script
        log_timing "Export conversation: $session_id"

        if node "$PROJECT_ROOT/.claude/hooks/auto-export-conversation.js" <<EOF 2>&1 | tee -a "$STATS_LOG"
{
  "hook_event_name": "SessionEnd",
  "transcript_path": "$jsonl_path",
  "session_id": "$session_id",
  "cwd": "$PROJECT_ROOT"
}
EOF
        then
            EXPORTED_COUNT=$((EXPORTED_COUNT + 1))
            log_stats "  ✅ Exported successfully"
        else
            ERROR_COUNT=$((ERROR_COUNT + 1))
            log_stats "  ❌ Export failed"
        fi
    fi
done <<< "$ACTIVE_FILES"

log_timing "Export process complete"

# Final statistics
FINAL_MEM=$(get_memory_mb)
MEM_DELTA=$(echo "$FINAL_MEM - $INITIAL_MEM" | bc)
TOTAL_TIME=$((($(date +%s%N) - START_TIME) / 1000000))

log_timing "COMPLETE"

# Summary log entry
log_stats "=== RUN SUMMARY ==="
log_stats "Total time: ${TOTAL_TIME}ms"
log_stats "Memory: ${INITIAL_MEM}MB -> ${FINAL_MEM}MB (delta: ${MEM_DELTA}MB)"
log_stats "Active files: $ACTIVE_COUNT"
log_stats "Exported: $EXPORTED_COUNT"
log_stats "Skipped: $SKIPPED_COUNT"
log_stats "Errors: $ERROR_COUNT"
log_stats ""

# Exit with error if any exports failed
if [ "$ERROR_COUNT" -gt 0 ]; then
    exit 1
fi

exit 0
