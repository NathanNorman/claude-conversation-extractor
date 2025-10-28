# Parallel Batch Processing Pattern

**Reusable formula for processing large datasets using parallel Claude Code agents**

*Extracted from vibe-log's orchestration pattern*

---

## 🎯 When to Use This Pattern

Use this pattern when you need to:
- Process 10+ items that can be analyzed independently
- Keep total processing time under 1 minute (regardless of item count)
- Distribute work across parallel agents efficiently
- Aggregate results into a final report/output

**Examples:**
- Analyze 50+ conversation files
- Process 100+ code files for metrics
- Batch API calls to external services
- Transform large datasets

---

## 📐 The Formula

### 1. Three-Agent System

You need **exactly 3 agent types**:

1. **Orchestrator** - Coordinates batching (main Claude instance)
2. **Batch Worker** - Processes N items independently (1-9 instances)
3. **Aggregator** - Combines results into final output (1 instance)

### 2. Core Batching Strategy

```
MAX_AGENTS = 9
ITEMS_PER_AGENT = 5-10

Batching Logic:
- If items ≤ 9:     1 agent  handles all
- If items ≤ 18:    2 agents, 5-9 each
- If items ≤ 27:    3 agents, 6-9 each
- If items ≤ 45:    5 agents, 6-9 each
- If items > 45:    9 agents, split evenly
```

### 3. Execution Flow

```
Phase 1: Discovery (3-5s)
  └─ Read manifest/list to find all items
  └─ Count total items
  └─ Calculate batching strategy

Phase 2: Parallel Processing (20-30s)
  └─ Group items into batches
  └─ Launch ALL batch workers in ONE message
  └─ Each worker processes its batch independently
  └─ Collect all results

Phase 3: Aggregation (10-15s)
  └─ Launch aggregator with all results
  └─ Generate final output

Total Time: 35-50 seconds (regardless of item count)
```

---

## 🔧 Implementation Template

### Step 1: Create Batch Worker Agent

**File:** `~/.claude/agents/[project]-batch-worker.md`

```markdown
---
name: [project]-batch-worker
description: Processes a batch of [items] independently
tools: Read, [other tools needed]
model: inherit
---

You are a focused batch processor. You analyze a BATCH of [items].

CRITICAL RULES:
- Process EVERY item in your assigned batch
- Return structured data for each item
- Work independently (no coordination with other agents)
- Do NOT use Write tool - just OUTPUT results

WORKFLOW:
1. Receive list of [items] to process
2. Process EACH item sequentially in your batch
3. Extract required data from each
4. Return JSON array with one object per item

RETURN FORMAT:
[
  {
    "id": "item-1",
    "extracted_data": { /* your analysis */ }
  },
  {
    "id": "item-2",
    "extracted_data": { /* your analysis */ }
  }
  // ... one object per item in your batch
]

CRITICAL: Process ALL items. Return complete array.
```

### Step 2: Create Aggregator Agent (Optional)

**File:** `~/.claude/agents/[project]-aggregator.md`

```markdown
---
name: [project]-aggregator
description: Combines batch results into final output
tools: Read, TodoWrite
model: inherit
---

You aggregate results from batch workers into a final report.

INPUT: You receive arrays of results from multiple batch workers

YOUR TASK:
1. Flatten and merge all batch results
2. Calculate overall statistics/metrics
3. OUTPUT final structured data

RETURN FORMAT:
{
  "metadata": {
    "totalItems": 0,
    "processingTime": "45s"
  },
  "summary": ["key insight 1", "key insight 2"],
  "results": [ /* aggregated data */ ]
}

CRITICAL: Return ONLY the JSON object. No explanations.
```

### Step 3: Create Orchestrator Prompt

```javascript
// Orchestrator system prompt (behavioral instructions)
const systemPrompt = `You are a [PROJECT] ORCHESTRATOR coordinating batch processing.

CRITICAL RULES:
- DO NOT process items yourself - delegate ALL work to batch workers
- Batch items to limit parallel agents (MAX 9 agents total)
- Launch ALL agents in ONE message with multiple Task calls
- Your role: Discover items → Launch batch workers → Collect results → Launch aggregator

BATCHING REQUIREMENTS:
- NEVER launch more than 9 agents total
- Each agent handles 5-10 items
- Launch ALL batch workers in ONE message with multiple Task calls
- Do NOT launch agents one by one - they must be parallel

BATCHING STRATEGY:
- If 1-9 items: 1 agent handles ALL
- If 10-18 items: 2 agents, each handles 5-9
- If 19-27 items: 3 agents, each handles 6-9
- If 28-45 items: 5 agents, each handles 6-9
- If >45 items: 9 agents, split evenly

EXECUTION FLOW:
1. Read manifest/list to discover items
2. Group items into batches (max 9 batches)
3. Launch ALL batch workers in parallel (one message, multiple Task calls)
4. Collect all results
5. Launch aggregator with combined data
6. Output final results`;

// Main orchestrator prompt (task instructions)
const prompt = `Process [N items] using parallel batch workers.

## Phase 1 - Discovery (5 seconds)
Read [manifest/list file] to discover all items.
Output: "Found X items, launching Y batch workers..."

## Phase 2 - Parallel Batch Processing (20-30 seconds)
Group items using the batching strategy above.

For each batch, launch:
Task(subagent_type="[project]-batch-worker",
     description="Process batch of [N] items",
     prompt="You are processing a BATCH of [items].

ITEMS TO PROCESS:
[List specific items for this batch]

INSTRUCTIONS:
1. Process EACH item in your batch
2. Extract [required data] from each
3. Return JSON array with one object per item

RETURN FORMAT:
[{ item data }, { item data }, ...]
")

IMPORTANT: Launch ALL batch workers in ONE message.

## Phase 3 - Aggregation (10 seconds)
After collecting ALL results, launch aggregator:

Task(subagent_type="[project]-aggregator",
     description="Aggregate batch results",
     prompt="Combine results from batch workers.

INPUT: [Arrays of results from workers]

OUTPUT: Final aggregated report as JSON")

KEY POINTS:
- Batch items to limit parallel agents (max 9)
- All batch workers launch IN ONE MESSAGE
- Each agent handles 5-10 items
- Total time: ~35-50 seconds`;
```

---

## 📋 Adaptation Checklist

To adapt this pattern to your use case:

- [ ] **Identify your items**: What are you processing? (files, records, API calls)
- [ ] **Define worker output**: What data does each worker extract?
- [ ] **Choose aggregation**: Do you need a final report? Or just collect results?
- [ ] **Name your agents**: `[project]-batch-worker`, `[project]-aggregator`
- [ ] **Create agent definitions**: Copy templates above to `~/.claude/agents/`
- [ ] **Build orchestrator prompt**: Customize the template with your specifics
- [ ] **Test with small batch**: Try 5-10 items first to validate
- [ ] **Scale up**: Run with full dataset (up to 100s of items)

---

## 🎓 Examples

### Example 1: Analyze 50 Conversation Files

```javascript
// Orchestrator discovers 50 conversation files
// Batching: 9 agents × 5-6 files each = 50 files

// Launch all 9 workers in parallel:
Task(subagent_type="conversation-analyzer",
     prompt="Analyze files: conv1.jsonl, conv2.jsonl, conv3.jsonl, conv4.jsonl, conv5.jsonl")
Task(subagent_type="conversation-analyzer",
     prompt="Analyze files: conv6.jsonl, conv7.jsonl, conv8.jsonl, conv9.jsonl, conv10.jsonl")
// ... 7 more workers ...

// After all workers complete:
Task(subagent_type="conversation-aggregator",
     prompt="Aggregate results from 9 batch workers...")
```

### Example 2: Process 100 API Requests

```javascript
// Orchestrator has 100 API endpoints to call
// Batching: 9 agents × 11-12 requests each = 100 requests

// Each worker gets a list of endpoints:
Task(subagent_type="api-batch-caller",
     prompt="Call these 11 endpoints: [list of URLs]")
// ... 8 more workers ...

// Aggregator combines responses:
Task(subagent_type="api-response-aggregator",
     prompt="Combine API responses into final dataset")
```

### Example 3: Extract Metrics from 200 Code Files

```javascript
// Orchestrator finds 200 .js files
// Batching: 9 agents × 22-23 files each = 200 files

// Each worker analyzes its batch:
Task(subagent_type="code-metrics-extractor",
     prompt="Extract metrics from: file1.js, file2.js, ..., file22.js")
// ... 8 more workers ...

// Aggregator generates metrics report:
Task(subagent_type="metrics-report-generator",
     prompt="Generate metrics report from all code files")
```

---

## ⚡ Performance Characteristics

| Dataset Size | Agents | Items/Agent | Total Time |
|--------------|--------|-------------|------------|
| 10 items     | 1      | 10          | ~25s       |
| 20 items     | 2      | 10 each     | ~35s       |
| 50 items     | 9      | 5-6 each    | ~40s       |
| 100 items    | 9      | 11-12 each  | ~45s       |
| 200 items    | 9      | 22-23 each  | ~50s       |

**Key insight:** Total time stays ~35-50 seconds regardless of item count due to parallelization.

---

## 🚫 Common Mistakes

### ❌ DON'T: Launch agents sequentially
```javascript
// WRONG - This takes 5 minutes for 10 agents
await launchAgent1();
await launchAgent2();
await launchAgent3();
// ...
```

### ✅ DO: Launch all agents in one message
```javascript
// CORRECT - This takes 30 seconds for 9 agents
Task(subagent_type="worker", prompt="batch 1")
Task(subagent_type="worker", prompt="batch 2")
Task(subagent_type="worker", prompt="batch 3")
// ... all 9 in same message
```

### ❌ DON'T: Create 1 agent per item
```javascript
// WRONG - 50 items = 50 agents = API limits
for (let i = 0; i < 50; i++) {
  Task(subagent_type="worker", prompt=`process item ${i}`)
}
```

### ✅ DO: Batch items into max 9 agents
```javascript
// CORRECT - 50 items = 9 agents × 5-6 items each
const batches = splitIntoBatches(items, 9);
batches.forEach(batch => {
  Task(subagent_type="worker", prompt=`process: ${batch.join(', ')}`)
});
```

### ❌ DON'T: Have orchestrator do the work
```javascript
// WRONG - Orchestrator analyzes files itself
const result = analyzeFile(file1);
```

### ✅ DO: Orchestrator only coordinates
```javascript
// CORRECT - Orchestrator delegates to workers
Task(subagent_type="worker", prompt="Analyze these files: ...")
```

---

## 🔍 Troubleshooting

**Problem:** Agents running sequentially instead of parallel
- **Cause:** Launching agents in separate messages
- **Fix:** Put all Task() calls in ONE message

**Problem:** Hitting agent limits (>9 agents)
- **Cause:** Not batching items properly
- **Fix:** Group items so each agent handles 5-10

**Problem:** Orchestrator analyzing items itself
- **Cause:** Unclear system prompt about delegation
- **Fix:** Add explicit "DO NOT process items yourself" rule

**Problem:** Inconsistent results from workers
- **Cause:** Workers not following return format
- **Fix:** Make return format very explicit in worker prompt

**Problem:** Aggregator timing out
- **Cause:** Too much data to process
- **Fix:** Have workers return summary data, not full text

---

## 📚 Additional Resources

- **Source pattern:** `~/vibe-log-cli/src/lib/prompts/orchestrator.ts`
- **Example workers:** `~/.claude/agents/vibe-log-session-analyzer.md`
- **Example aggregator:** `~/.claude/agents/vibe-log-report-generator.md`

---

## 🎯 Quick Start Template

Copy and customize this minimal working example:

```bash
# 1. Create worker agent
cat > ~/.claude/agents/my-batch-worker.md << 'EOF'
---
name: my-batch-worker
description: Processes a batch of items
tools: Read
model: inherit
---
Process EACH item in your batch. Return JSON array: [{ "id": "...", "data": {...} }]
EOF

# 2. Create orchestrator prompt
PROMPT="Process 50 items using batch workers.
Discovery: Read items.json to find all items.
Batching: Group into 9 batches of 5-6 items each.
Processing: Launch 9 workers in parallel with Task().
Example: Task(subagent_type='my-batch-worker', prompt='Process: item1, item2, item3')"

# 3. Run it
claude "$PROMPT"
```

---

**Pattern Version:** 1.0 (extracted from vibe-log 2024-09)
