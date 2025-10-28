/**
 * Batch Processing Utilities
 *
 * Helper functions for implementing the parallel batch processing pattern.
 * Based on the vibe-log orchestration pattern.
 *
 * @see docs/PARALLEL_BATCH_PROCESSING_PATTERN.md
 */

/**
 * Calculate optimal batching strategy
 * @param {number} itemCount - Total number of items to process
 * @returns {{agents: number, itemsPerAgent: number, batches: number}}
 */
export function calculateBatching(itemCount) {
  const MAX_AGENTS = 9;

  if (itemCount <= MAX_AGENTS) {
    return {
      agents: 1,
      itemsPerAgent: itemCount,
      batches: 1
    };
  }

  // Determine agent count based on item count
  let agents;
  if (itemCount <= 18) agents = 2;
  else if (itemCount <= 27) agents = 3;
  else if (itemCount <= 45) agents = 5;
  else agents = MAX_AGENTS;

  const itemsPerAgent = Math.ceil(itemCount / agents);

  return {
    agents,
    itemsPerAgent,
    batches: agents
  };
}

/**
 * Split items into batches
 * @param {Array} items - Array of items to batch
 * @param {number} maxBatches - Maximum number of batches (default: 9)
 * @returns {Array<Array>} Array of batches
 */
export function createBatches(items, maxBatches = 9) {
  if (items.length === 0) {
    return [];
  }

  const strategy = calculateBatching(items.length);
  const batches = [];

  for (let i = 0; i < strategy.agents; i++) {
    const start = i * strategy.itemsPerAgent;
    const end = Math.min(start + strategy.itemsPerAgent, items.length);
    if (start < items.length) {
      batches.push(items.slice(start, end));
    }
  }

  return batches;
}

/**
 * Generate orchestrator system prompt
 * @param {Object} options - Configuration options
 * @param {string} options.projectName - Name of the project/task
 * @param {number} options.totalItems - Total number of items
 * @param {number} options.batchCount - Number of batches
 * @returns {string} System prompt for orchestrator
 */
export function generateSystemPrompt({ projectName, totalItems, batchCount }) {
  return `You are a ${projectName.toUpperCase()} ORCHESTRATOR coordinating batch processing.

CRITICAL RULES:
- DO NOT process items yourself - delegate ALL work to batch workers
- Batch items to limit parallel agents (MAX 9 agents total)
- Launch ALL ${batchCount} agents in ONE message with multiple Task calls
- Your role: Discover items → Launch batch workers → Collect results → Aggregate

BATCHING REQUIREMENTS:
- NEVER launch more than 9 agents total
- Each agent handles 5-10 items (current: ${Math.ceil(totalItems / batchCount)} items per agent)
- Launch ALL batch workers in ONE message with multiple Task calls
- Do NOT launch agents one by one - they must be parallel

EXECUTION FLOW:
1. Read manifest/list to discover items
2. Group items into ${batchCount} batches
3. Launch ALL ${batchCount} batch workers in parallel (one message, multiple Task calls)
4. Collect all results
5. Launch aggregator with combined data (if needed)
6. Output final results

COMMUNICATION:
- Announce batching strategy clearly
- Show how many agents are being launched
- Keep updates concise`;
}

/**
 * Generate batch worker task prompt
 * @param {Object} options - Configuration options
 * @param {string} options.workerType - Agent type name (e.g., "conversation-extractor-worker")
 * @param {number} options.batchIndex - Index of this batch (0-based)
 * @param {Array} options.items - Items in this batch
 * @param {string} options.taskDescription - What the worker should do
 * @returns {string} Task prompt for worker
 */
export function generateWorkerPrompt({ workerType, batchIndex, items, taskDescription }) {
  const itemList = items.map(item => {
    if (typeof item === 'string') {
      return `- ${item}`;
    } else if (item.path || item.file) {
      return `- ${item.path || item.file}`;
    } else if (item.id) {
      return `- ${item.id}`;
    } else {
      return `- ${JSON.stringify(item)}`;
    }
  }).join('\n');

  return `Task(subagent_type="${workerType}",
     description="Process batch ${batchIndex + 1} (${items.length} items)",
     prompt="You are processing a BATCH of items.

ITEMS TO PROCESS (${items.length} total):
${itemList}

TASK:
${taskDescription}

CRITICAL:
- Process EVERY item in your batch
- Return JSON array with one object per item
- Format: [{ id: '...', result: {...} }, ...]
")`;
}

/**
 * Generate complete orchestrator prompt
 * @param {Object} options - Configuration options
 * @param {string} options.projectName - Name of the project/task
 * @param {string} options.workerType - Worker agent type
 * @param {string} options.aggregatorType - Aggregator agent type (optional)
 * @param {Array} options.items - All items to process
 * @param {string} options.taskDescription - Description of what workers do
 * @param {string} options.aggregationDescription - Description of aggregation (optional)
 * @returns {string} Complete orchestrator prompt
 */
export function generateOrchestratorPrompt({
  projectName,
  workerType,
  aggregatorType = null,
  items,
  taskDescription,
  aggregationDescription = null
}) {
  const batches = createBatches(items);
  const strategy = calculateBatching(items.length);

  const systemPrompt = generateSystemPrompt({
    projectName,
    totalItems: items.length,
    batchCount: batches.length
  });

  const workerTasks = batches.map((batch, i) =>
    generateWorkerPrompt({
      workerType,
      batchIndex: i,
      items: batch,
      taskDescription
    })
  ).join('\n\n');

  const aggregatorTask = aggregatorType ? `
## Phase 3 - Aggregation (10 seconds)

After collecting ALL results from ${batches.length} workers, launch aggregator:

Task(subagent_type="${aggregatorType}",
     description="Aggregate results from ${batches.length} batch workers",
     prompt="${aggregationDescription || 'Combine results from all batch workers into final output.'}")
` : '';

  const mainPrompt = `Process ${items.length} items using parallel batch workers.

## Phase 1 - Discovery (3 seconds)
Items have been pre-discovered: ${items.length} total items.
Batching strategy: ${batches.length} agents × ~${strategy.itemsPerAgent} items each

## Phase 2 - Parallel Batch Processing (20-30 seconds)

Launch ALL ${batches.length} workers in ONE message:

${workerTasks}

CRITICAL: All Task() calls above must be in ONE message for parallel execution.
${aggregatorTask}
## Summary

- Total items: ${items.length}
- Batches: ${batches.length} agents × ~${strategy.itemsPerAgent} items each
- Expected time: ~${aggregatorType ? '35-40' : '25-30'} seconds
- Parallel execution: Yes (all workers launch together)`;

  return {
    systemPrompt,
    mainPrompt,
    batches,
    strategy
  };
}

/**
 * Format batching info for display
 * @param {Array} items - Items to process
 * @returns {string} Human-readable batching info
 */
export function formatBatchingInfo(items) {
  const strategy = calculateBatching(items.length);
  const batches = createBatches(items);

  return `
Batching Strategy:
  Total items: ${items.length}
  Agents: ${strategy.agents}
  Items per agent: ~${strategy.itemsPerAgent}
  Actual batches: ${batches.map(b => b.length).join(', ')}

Performance:
  Sequential time: ~${Math.ceil(items.length * 0.8)}s (@ 800ms/item)
  Parallel time: ~${25 + (strategy.itemsPerAgent * 1.5)}s
  Speedup: ${(items.length * 0.8 / (25 + strategy.itemsPerAgent * 1.5)).toFixed(1)}x
`;
}

/**
 * Validate batching configuration
 * @param {Array} batches - Batches to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateBatching(batches) {
  const errors = [];

  if (batches.length === 0) {
    errors.push('No batches created');
  }

  if (batches.length > 9) {
    errors.push(`Too many batches: ${batches.length} (max: 9)`);
  }

  batches.forEach((batch, i) => {
    if (batch.length === 0) {
      errors.push(`Batch ${i} is empty`);
    }
    if (batch.length < 3 && batches.length > 1) {
      errors.push(`Batch ${i} has only ${batch.length} items (inefficient batching)`);
    }
    if (batch.length > 30) {
      errors.push(`Batch ${i} has ${batch.length} items (consider splitting further)`);
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

export default {
  calculateBatching,
  createBatches,
  generateSystemPrompt,
  generateWorkerPrompt,
  generateOrchestratorPrompt,
  formatBatchingInfo,
  validateBatching
};
