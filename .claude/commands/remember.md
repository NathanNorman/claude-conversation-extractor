---
allowed-tools: Bash
description: Search previous conversations using natural language
argument-hint: [search query or date filter]
---

# Finding Previous Conversations

The user asked to remember: **"$ARGUMENTS"**

## Your Task

Search through their previous Claude Code conversation history using `claude-logs` in non-interactive mode.

## Available Search Commands

### Search by content
```bash
claude-logs --search "$ARGUMENTS" --json --limit 10
```

### Filter by date (if query mentions time)
- If query mentions "yesterday": `--filter-date yesterday`
- If query mentions "last week": `--filter-date lastweek`
- If query mentions "today": `--filter-date today`
- If query mentions "last month": `--filter-date lastmonth`

### Filter by project (if query mentions project name)
```bash
claude-logs --search "keywords" --filter-repo "project-name" --json
```

## Command to Run

Based on the user's query, construct and run the appropriate `claude-logs` command.

**Example queries:**
- "API authentication" → `claude-logs --search "API authentication" --json`
- "what did I work on yesterday" → `claude-logs --filter-date yesterday --json`
- "database schema last week" → `claude-logs --search "database schema" --filter-date lastweek --json`

## After Getting Results

1. Parse the JSON output
2. Summarize what conversations were found
3. Show the most relevant results (project, date, preview)
4. Ask if the user wants to see more details or open a specific conversation

**Note:** The JSON output includes `filePath` for each result - you can read those files to show full conversation content.
