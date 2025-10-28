# Batch Processing Pattern - Documentation Index

**Complete guide to implementing parallel batch processing with Claude Code agents**

---

## 📚 Documentation Structure

### 1. **Full Pattern Guide** → `PARALLEL_BATCH_PROCESSING_PATTERN.md`
   - Complete explanation of the pattern
   - Detailed implementation steps
   - Common mistakes and troubleshooting
   - **Read this first** for deep understanding

### 2. **Quick Reference** → `PARALLEL_PROCESSING_QUICK_REF.md`
   - One-page cheat sheet
   - Batching formula
   - Essential rules
   - **Use this** for quick lookups

### 3. **Code Utilities** → `../src/utils/batch-processor.js`
   - JavaScript helper functions
   - Automatic batch calculation
   - Prompt generation
   - **Use this** to build orchestrators quickly

### 4. **Concrete Example** → `examples/parallel-bulk-extraction-example.md`
   - Real-world application to this project
   - Step-by-step walkthrough
   - Performance comparisons
   - **Use this** as a template for your own use cases

---

## 🚀 Quick Start

### Option 1: Manual Implementation (10 minutes)

```bash
# 1. Read the pattern
open docs/PARALLEL_BATCH_PROCESSING_PATTERN.md

# 2. Create worker agent
cat > ~/.claude/agents/my-worker.md << 'EOF'
---
name: my-worker
tools: Read
---
Process items in batch. Return JSON array.
EOF

# 3. Create orchestrator prompt
cat > prompt.txt << 'EOF'
Process N items:
1. Read items.json
2. Batch into 9 groups
3. Task(subagent_type="my-worker", prompt="items: ...")
EOF

# 4. Run
claude < prompt.txt
```

### Option 2: Using Utilities (2 minutes)

```javascript
import {
  generateOrchestratorPrompt,
  formatBatchingInfo
} from './src/utils/batch-processor.js';

// Your items to process
const items = ['file1.txt', 'file2.txt', /* ... */ 'file150.txt'];

// Generate complete prompt
const { systemPrompt, mainPrompt, strategy } = generateOrchestratorPrompt({
  projectName: 'file-processor',
  workerType: 'file-processor-worker',
  items,
  taskDescription: 'Read each file and extract metadata'
});

console.log(formatBatchingInfo(items));
console.log('\n=== SYSTEM PROMPT ===\n', systemPrompt);
console.log('\n=== MAIN PROMPT ===\n', mainPrompt);

// Copy prompts to Claude Code
```

---

## 🎯 When to Use This Pattern

✅ **Good fit:**
- 10+ items that can be processed independently
- Each item takes 0.5-2 seconds to process
- Results can be aggregated
- Order doesn't matter

❌ **Not a good fit:**
- < 10 items (overhead not worth it)
- Items depend on each other (not parallelizable)
- Items take > 5 seconds each (too slow even in parallel)
- Order matters (parallel processing loses sequence)

---

## 📊 Performance Guide

| Items | Sequential | Parallel | Speedup |
|-------|-----------|----------|---------|
| 10    | 8s        | 25s      | 0.3x ❌ |
| 20    | 16s       | 30s      | 0.5x ❌ |
| 50    | 40s       | 35s      | 1.1x ✅ |
| 100   | 80s       | 40s      | 2.0x ✅ |
| 200   | 160s      | 45s      | 3.5x ✅ |
| 500   | 400s      | 50s      | 8.0x ✅ |

**Break-even point:** ~40 items (worth the parallelization overhead)

**Optimal range:** 50-500 items (maximum benefit)

---

## 🔧 Available Tools

### JavaScript Utilities

```javascript
import {
  calculateBatching,      // Get optimal batch strategy
  createBatches,          // Split items into batches
  generateSystemPrompt,   // Create orchestrator system prompt
  generateWorkerPrompt,   // Create worker task prompt
  generateOrchestratorPrompt,  // Generate complete orchestrator
  formatBatchingInfo,     // Pretty-print batching info
  validateBatching        // Validate batch configuration
} from './src/utils/batch-processor.js';
```

### Agent Templates

Located in `~/.claude/agents/`:
- `vibe-log-session-analyzer.md` - Example batch worker
- `vibe-log-report-generator.md` - Example aggregator

---

## 📋 Implementation Checklist

### Phase 1: Design (5 min)
- [ ] Identify items to process
- [ ] Define worker input/output format
- [ ] Decide if aggregation is needed
- [ ] Name your agents (`[project]-worker`, `[project]-aggregator`)

### Phase 2: Create Agents (10 min)
- [ ] Create worker agent definition in `~/.claude/agents/`
- [ ] Create aggregator agent (if needed)
- [ ] Test worker with 1-2 items manually

### Phase 3: Build Orchestrator (5 min)
- [ ] Use `generateOrchestratorPrompt()` OR
- [ ] Write custom orchestrator following pattern
- [ ] Verify batching calculation is correct

### Phase 4: Test (10 min)
- [ ] Test with 5 items (should use 1 agent)
- [ ] Test with 20 items (should use 2 agents)
- [ ] Verify ALL agents launch in ONE message
- [ ] Check results are complete

### Phase 5: Production (5 min)
- [ ] Run with full dataset
- [ ] Verify timing is < 50 seconds
- [ ] Validate all items were processed
- [ ] Check aggregated results

**Total time:** ~35 minutes from zero to production

---

## 🎓 Learning Path

### Beginner
1. Read: `PARALLEL_PROCESSING_QUICK_REF.md` (5 min)
2. Try: Manual implementation with 10 items (10 min)
3. Understand: Why batching is needed

### Intermediate
1. Read: `PARALLEL_BATCH_PROCESSING_PATTERN.md` (20 min)
2. Study: `examples/parallel-bulk-extraction-example.md` (15 min)
3. Build: Your own use case with utilities (30 min)

### Advanced
1. Study: `~/vibe-log-cli/src/lib/prompts/orchestrator.ts` (source)
2. Optimize: Worker batch sizes for your data
3. Extend: Add retry logic, error handling, progress tracking

---

## 🔍 Debugging Guide

### Problem: Agents running sequentially

**Symptoms:**
- Total time = N × worker time (not constant)
- Workers complete one after another

**Causes:**
1. Task() calls in separate messages
2. Await between launches
3. System prompt doesn't enforce parallelism

**Fix:**
```javascript
// ❌ Wrong - Sequential
await Task(...); await Task(...); await Task(...);

// ✅ Right - Parallel
Task(...) Task(...) Task(...)  // All in ONE message
```

### Problem: Too many agents

**Symptoms:**
- Error: "Too many concurrent agents"
- Some agents don't start

**Causes:**
1. Not batching items (1 agent per item)
2. Wrong batch calculation

**Fix:**
```javascript
// ❌ Wrong - 50 agents
items.forEach(item => Task(...));

// ✅ Right - 9 agents max
const batches = createBatches(items, 9);
batches.forEach(batch => Task(...));
```

### Problem: Orchestrator doing work

**Symptoms:**
- Orchestrator taking long time
- No agent launches visible

**Causes:**
1. System prompt doesn't enforce delegation
2. Orchestrator prompt includes work instructions

**Fix:**
```javascript
const systemPrompt = `
CRITICAL: DO NOT process items yourself
Launch workers: Task(subagent_type=...)
`;
```

---

## 📚 References

### Internal
- Pattern origin: `~/vibe-log-cli/src/lib/prompts/orchestrator.ts`
- Example agents: `~/.claude/agents/vibe-log-*.md`
- This project: `claude-conversation-extractor`

### External
- Claude Code Agent Documentation
- MiniSearch (used in example)
- Task API documentation

---

## 🤝 Contributing

To improve this pattern:

1. **Found a bug?** Update the docs with the fix
2. **Better optimization?** Share the improvement
3. **New use case?** Add to examples/
4. **Performance data?** Update the tables

---

## 📜 License

Pattern extracted from vibe-log (MIT License)
Documentation and utilities: Same as project license

---

**Last Updated:** 2024-10-27
**Pattern Version:** 1.0
**Source Project:** vibe-log-cli → claude-conversation-extractor
