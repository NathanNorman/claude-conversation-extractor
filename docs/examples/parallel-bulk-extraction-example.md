# Example: Parallel Bulk Conversation Extraction

**Concrete example applying the batch processing pattern to this project**

---

## Scenario

You have 150 conversation JSONL files in `~/.claude/projects/` that need to be:
1. Converted to markdown
2. Archived to `~/.claude/claude_conversations/`
3. Indexed in the search index

Currently, bulk extraction takes ~2 minutes for 150 files (sequential processing).

**Goal:** Reduce to ~40 seconds using parallel batch processing.

---

## Implementation

### Step 1: Create Conversation Extractor Agent

**File:** `~/.claude/agents/conversation-extractor-worker.md`

```markdown
---
name: conversation-extractor-worker
description: Extracts a batch of conversation files to markdown
tools: Read, Write
model: inherit
---

You are a conversation extraction worker processing a BATCH of JSONL files.

CRITICAL RULES:
- Process EVERY file in your assigned batch
- Convert each JSONL to markdown using the standard format
- Save to ~/.claude/claude_conversations/
- Return status for each file processed
- Do NOT update the search index (handled separately)

WORKFLOW:
1. Receive list of JSONL file paths
2. For EACH file in your batch:
   - Read the JSONL file
   - Parse each line as JSON
   - Extract: sessionId, project, messages, timestamps
   - Generate markdown with format:
     ```
     # Conversation: [project] - [date]
     Session ID: [id]

     ## User:
     [message]

     ## Assistant:
     [message]
     ```
   - Write to: ~/.claude/claude_conversations/[project]_[sessionId].md
3. Return JSON array with status for each file

RETURN FORMAT:
[
  {
    "file": "/path/to/session1.jsonl",
    "sessionId": "abc123",
    "project": "my-project",
    "outputPath": "/path/to/output.md",
    "messageCount": 42,
    "success": true,
    "error": null
  },
  {
    "file": "/path/to/session2.jsonl",
    // ... same structure
  }
  // ... one object per file in your batch
]

CRITICAL: Process ALL files in your batch. Return complete array.
```

### Step 2: Create Index Updater Agent

**File:** `~/.claude/agents/conversation-index-updater.md`

```markdown
---
name: conversation-index-updater
description: Updates search index with newly extracted conversations
tools: Read, Write
model: inherit
---

You update the search index with results from extraction workers.

INPUT: Arrays of extraction results from multiple workers

YOUR TASK:
1. Collect all successfully extracted files
2. Load existing search index from ~/.claude/claude_conversations/search-index-v2.json
3. Add new conversations to index:
   - Extract keywords from markdown content
   - Build search metadata (project, date, sessionId, excerpt)
   - Add to MiniSearch index
4. Save updated index

RETURN FORMAT:
{
  "indexUpdated": true,
  "conversationsAdded": 150,
  "totalConversations": 823,
  "indexPath": "/path/to/search-index-v2.json"
}

CRITICAL: Update index incrementally. Don't rebuild from scratch.
```

### Step 3: Create Orchestrator Prompt

**File:** `scripts/parallel-bulk-extract.js`

```javascript
#!/usr/bin/env node

/**
 * Parallel Bulk Extraction using Batch Processing Pattern
 * Extracts 150 conversations in ~40s instead of 2 minutes
 */

import { readdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');
const MAX_AGENTS = 9;

// Discovery Phase
console.log('Phase 1: Discovering conversation files...');
const projectDirs = await readdir(PROJECTS_DIR);
const allFiles = [];

for (const projectDir of projectDirs) {
  const projectPath = join(PROJECTS_DIR, projectDir);
  const files = await readdir(projectPath);
  const jsonlFiles = files
    .filter(f => f.endsWith('.jsonl'))
    .map(f => join(projectPath, f));
  allFiles.push(...jsonlFiles);
}

console.log(`Found ${allFiles.length} conversation files`);

// Batching Phase
const itemsPerAgent = Math.ceil(allFiles.length / MAX_AGENTS);
const batches = [];

for (let i = 0; i < MAX_AGENTS; i++) {
  const start = i * itemsPerAgent;
  const end = Math.min(start + itemsPerAgent, allFiles.length);
  if (start < allFiles.length) {
    batches.push(allFiles.slice(start, end));
  }
}

console.log(`Batching: ${batches.length} agents × ${itemsPerAgent} files each\n`);

// Generate orchestrator prompt
const systemPrompt = `You are a CONVERSATION EXTRACTION ORCHESTRATOR.

CRITICAL RULES:
- DO NOT extract files yourself - delegate to batch workers
- Launch ALL ${batches.length} workers in ONE message with multiple Task calls
- Your role: Launch workers → Collect results → Update index

EXECUTION FLOW:
1. Launch ${batches.length} extraction workers in parallel (one message)
2. Collect all extraction results
3. Launch index updater with combined results`;

const prompt = `Extract ${allFiles.length} conversation files to markdown using parallel batch workers.

Files have been pre-discovered. You have ${batches.length} batches to process.

## Phase 1 - Parallel Extraction (25-30 seconds)

Launch ALL ${batches.length} workers in ONE message:

${batches.map((batch, i) => `
Task(subagent_type="conversation-extractor-worker",
     description="Extract batch ${i+1} (${batch.length} files)",
     prompt="Extract these ${batch.length} conversation files to markdown:

FILES:
${batch.map(f => `- ${f}`).join('\n')}

Process EACH file and return JSON array with extraction results.")
`).join('\n')}

CRITICAL: All Task() calls above must be in ONE message for parallel execution.

## Phase 2 - Index Update (10 seconds)

After collecting ALL extraction results, launch index updater:

Task(subagent_type="conversation-index-updater",
     description="Update search index with ${allFiles.length} new conversations",
     prompt="Update search index with extraction results.

INPUT: You received ${batches.length} arrays of extraction results.

Add all successfully extracted conversations to the search index.
Return: { indexUpdated: true, conversationsAdded: N, totalConversations: N }")

## Summary

- Total files: ${allFiles.length}
- Batches: ${batches.length} agents × ~${itemsPerAgent} files each
- Expected time: ~35-40 seconds
- Parallel execution: Yes (all workers launch together)`;

console.log('Generated orchestrator prompt:\n');
console.log('System Prompt:');
console.log(systemPrompt);
console.log('\n---\n');
console.log('Main Prompt:');
console.log(prompt);
console.log('\n---\n');
console.log('To execute: Copy the prompts above and run in Claude Code');
```

### Step 4: Usage

```bash
# Generate the orchestrator prompt
node scripts/parallel-bulk-extract.js

# Copy the output and paste into Claude Code
# Claude will:
#   1. Launch 9 workers in parallel (one message)
#   2. Each worker extracts 16-17 files
#   3. All workers complete in ~25s
#   4. Index updater runs (~10s)
#   5. Total: ~40s for 150 files

# Or run directly:
node scripts/parallel-bulk-extract.js | claude
```

---

## Performance Comparison

### Before (Sequential)
```
Processing 150 files sequentially...
File 1/150: 800ms
File 2/150: 850ms
...
File 150/150: 820ms

Total time: 2 minutes 5 seconds
```

### After (Parallel)
```
Phase 1: Discovery (3s)
Phase 2: Launching 9 workers in parallel (5s)
  Worker 1-9: Processing batches of 16-17 files each...
  Worker 1: Completed 17 files in 24s
  Worker 2: Completed 17 files in 25s
  ...
  Worker 9: Completed 15 files in 23s
Phase 3: Updating search index (10s)

Total time: 38 seconds (3.3x faster!)
```

---

## Benefits

1. **Speed:** 2 min → 40s (3.3x faster)
2. **Scalability:** Time stays ~constant even with 300+ files
3. **Reliability:** Each worker is independent (one failure doesn't block others)
4. **Resource usage:** Controlled parallelism (max 9 workers)
5. **Index consistency:** Single index update at the end

---

## Adaptations for Other Use Cases

This same pattern applies to:

### A. Parallel Search Across Projects
```javascript
// Search 50 projects in parallel
// 9 workers × 5-6 projects each
Task(subagent_type="project-search-worker",
     prompt="Search projects: project1, project2, project3...")
```

### B. Parallel Export to Multiple Formats
```javascript
// Export 100 conversations to HTML/JSON/PDF
// 9 workers × 11-12 conversations each
Task(subagent_type="multi-format-exporter",
     prompt="Export conversations: conv1, conv2, ... (formats: html, json, pdf)")
```

### C. Parallel Analysis/Metrics
```javascript
// Analyze 200 conversations for metrics
// 9 workers × 22-23 conversations each
Task(subagent_type="conversation-analyzer",
     prompt="Analyze conversations: conv1, conv2, ... (extract: duration, tools, keywords)")
```

---

## Testing

### Small Test (5 files)
```bash
# Test with 5 files first
node scripts/parallel-bulk-extract.js --limit 5
# Should use 1 worker, ~10s total
```

### Medium Test (20 files)
```bash
# Test with 20 files
node scripts/parallel-bulk-extract.js --limit 20
# Should use 2 workers, ~15s total
```

### Full Production (150 files)
```bash
# Full extraction
node scripts/parallel-bulk-extract.js
# Should use 9 workers, ~40s total
```

---

## Troubleshooting

**Problem:** Workers running sequentially
- Check that ALL Task() calls are in ONE message
- Verify system prompt says "Launch ALL workers in ONE message"

**Problem:** Some files not extracted
- Check worker return arrays - should have one entry per file
- Look for error messages in worker outputs

**Problem:** Index update fails
- Verify workers return structured JSON
- Check that index updater can parse all results

**Problem:** Taking longer than 40s
- Check worker batch sizes (should be 15-20 files each)
- Verify parallel execution (all workers start at same time)
- Look for network issues or large files

---

**Pattern Applied:** ✅ Three-agent system (orchestrator + workers + aggregator)
**Expected Speedup:** ✅ 3.3x faster (2min → 40s)
**Scalability:** ✅ Time stays constant up to 200+ files
