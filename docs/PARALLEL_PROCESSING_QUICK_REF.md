# Parallel Processing Quick Reference

**One-page cheat sheet for the batch processing pattern**

---

## 🎯 The Pattern in 60 Seconds

```
1. Orchestrator discovers items (read manifest/list)
2. Orchestrator calculates batches (max 9 agents, 5-10 items each)
3. Orchestrator launches ALL workers in ONE message
4. Workers process batches independently
5. Orchestrator collects results
6. Orchestrator launches aggregator (optional)
```

---

## 📐 Batching Formula

```javascript
function calculateBatches(itemCount) {
  if (itemCount <= 9)  return { agents: 1, itemsEach: itemCount };
  if (itemCount <= 18) return { agents: 2, itemsEach: Math.ceil(itemCount/2) };
  if (itemCount <= 27) return { agents: 3, itemsEach: Math.ceil(itemCount/3) };
  if (itemCount <= 45) return { agents: 5, itemsEach: Math.ceil(itemCount/5) };
  return { agents: 9, itemsEach: Math.ceil(itemCount/9) };
}

// Examples:
// 17 items → 2 agents × 9 items each
// 50 items → 9 agents × 6 items each
// 100 items → 9 agents × 12 items each
```

---

## 🔧 Three Components

### 1. Worker Agent (`~/.claude/agents/[name]-batch-worker.md`)

```markdown
---
name: my-batch-worker
tools: Read
---
Process EACH item in your batch.
RETURN: [{ "id": "item1", "data": {...} }, { "id": "item2", "data": {...} }]
```

### 2. Aggregator Agent (optional) (`~/.claude/agents/[name]-aggregator.md`)

```markdown
---
name: my-aggregator
tools: Read, TodoWrite
---
Combine results from workers.
RETURN: { "summary": [...], "results": [...] }
```

### 3. Orchestrator Prompt

```javascript
const systemPrompt = `ORCHESTRATOR RULES:
- DO NOT process items yourself
- Launch ALL workers in ONE message
- Max 9 agents total
- Each agent handles 5-10 items`;

const prompt = `
Phase 1: Read items.json → count items
Phase 2: Launch workers in parallel:
  Task(subagent_type="worker", prompt="items: 1,2,3,4,5")
  Task(subagent_type="worker", prompt="items: 6,7,8,9,10")
  ...
Phase 3: Task(subagent_type="aggregator", prompt="combine results")
`;
```

---

## ⚡ Key Rules

| Rule | Why |
|------|-----|
| Max 9 agents | Claude Code parallel limit |
| 5-10 items/agent | Optimal batch size |
| ONE message launch | Required for parallel execution |
| Orchestrator delegates | Keeps orchestrator fast |
| Workers return JSON | Easy to aggregate |

---

## ✅ Checklist

- [ ] Created worker agent definition
- [ ] Created aggregator agent (if needed)
- [ ] System prompt enforces delegation
- [ ] Batching calculation is correct
- [ ] ALL Task() calls in ONE message
- [ ] Worker returns structured data
- [ ] Tested with small dataset first

---

## 🚨 Critical Don'ts

❌ Launch agents one-by-one (sequential)
❌ Create 1 agent per item (too many)
❌ Orchestrator processes items itself
❌ Workers return unstructured text
❌ Forget to batch large datasets

---

## 📊 Performance Table

| Items | Agents | Each | Time |
|-------|--------|------|------|
| 10    | 1      | 10   | 25s  |
| 20    | 2      | 10   | 35s  |
| 50    | 9      | 6    | 40s  |
| 100   | 9      | 12   | 45s  |
| 200   | 9      | 23   | 50s  |

**Time stays ~constant due to parallelization!**

---

## 🎯 Template (Copy & Customize)

```bash
# 1. Create worker
cat > ~/.claude/agents/PROJECT-worker.md << 'EOF'
---
name: PROJECT-worker
tools: Read
model: inherit
---
Process items in batch. Return: [{"id": "...", "result": {...}}]
EOF

# 2. Run orchestrator
claude "Process N items:
1. Read manifest.json
2. Batch into groups of 5-10
3. Launch workers: Task(subagent_type='PROJECT-worker', prompt='items: ...')
4. Aggregate results"
```

---

## 📚 Full Documentation

See: `docs/PARALLEL_BATCH_PROCESSING_PATTERN.md`
