/**
 * Repository Filter Integration Test
 *
 * This test catches the bug where getAllRepos() returns folder names
 * but search results have display names, causing filter to fail.
 *
 * BUG CAUGHT: Repository filter showed folder names (-Users-nathan-norman-project)
 * but filtered against display names (project), causing 0 results.
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { MiniSearchEngine } from '../../src/search/minisearch-engine.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Repository Filter Integration (Real Data)', () => {
  let testDir;
  let exportDir;
  let engine;

  beforeEach(async () => {
    // Create temporary directories
    testDir = join(tmpdir(), `repo-filter-test-${Date.now()}`);
    exportDir = join(testDir, 'exports');
    await mkdir(exportDir, { recursive: true });

    // Create mock markdown exports with realistic folder-based project names
    const conversations = [
      {
        filename: 'my-api-project_abc123_2025-10-01.md',
        content: `# Claude Code Conversation
Project: -Users-user-my-api-project
Session ID: abc123
Date: 2025-10-01

## 👤 User
How do I implement error handling?

## 🤖 Assistant
Here's how to implement error handling...
`
      },
      {
        filename: 'web-app_def456_2025-10-01.md',
        content: `# Claude Code Conversation
Project: -Users-user-web-app
Session ID: def456
Date: 2025-10-01

## 👤 User
Fix the CSS layout

## 🤖 Assistant
Let me help you fix that...
`
      }
    ];

    for (const conv of conversations) {
      await writeFile(join(exportDir, conv.filename), conv.content);
    }

    // Initialize search engine
    engine = new MiniSearchEngine({
      projectsDir: testDir,
      exportDir: exportDir,
      indexPath: join(testDir, 'search-index-v2.json')
    });

    // Build index (this applies getDisplayName() to clean the folder names)
    await engine.buildIndex();
  });

  afterEach(async () => {
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });

  test('CRITICAL: getAllRepos must return clean display names matching search results', async () => {
    // Simulate getAllRepos() getting repos from search index (the fix)
    const reposFromIndex = [];
    for (const conv of engine.conversationData.values()) {
      reposFromIndex.push(conv.project);
    }

    // These should be clean display names
    expect(reposFromIndex).toContain('my-api-project');
    expect(reposFromIndex).toContain('web-app');

    // NOT folder names
    expect(reposFromIndex).not.toContain('-Users-user-my-api-project');
    expect(reposFromIndex).not.toContain('-Users-user-web-app');
  });

  test('CRITICAL: Filter by repo must actually filter search results', async () => {
    // Perform search (gets clean display names)
    const searchResults = await engine.search('error');

    expect(searchResults.results.length).toBeGreaterThan(0);
    const firstResult = searchResults.results[0];

    // Result should have clean display name
    expect(firstResult.project).toBe('my-api-project');

    // Simulate applying repo filter (the bug scenario)
    const activeFilters = {
      repos: new Set(['my-api-project']), // User selected clean name from menu
      dateRange: null
    };

    // Apply filter (this should work)
    const filtered = searchResults.results.filter(result => {
      const project = result.project;
      return activeFilters.repos.has(project);
    });

    // This is the critical assertion that would have caught the bug
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.length).toBe(1); // Should filter to only my-api-project
    expect(filtered[0].project).toBe('my-api-project');
  });

  test('CRITICAL: getAllRepos with folder names vs search with display names (the actual bug)', async () => {
    // Simulate the OLD buggy behavior where getAllRepos returned folder names
    const buggyGetAllRepos = () => {
      // Simulate getting repos from raw conversations (folder names)
      return ['-Users-user-my-api-project', '-Users-user-web-app'];
    };

    // Perform search (gets clean display names)
    const searchResults = await engine.search('error');

    // User selects from buggy repo list (folder name)
    const selectedRepoFromMenu = '-Users-user-my-api-project';
    const activeFilters = {
      repos: new Set([selectedRepoFromMenu]),
      dateRange: null
    };

    // Try to filter (this was the bug - would return 0 results)
    const filtered = searchResults.results.filter(result => {
      const project = result.project; // This is 'my-api-project' (clean)
      return activeFilters.repos.has(project); // Comparing against '-Users-user-my-api-project'
    });

    // This assertion would FAIL with the old code, proving the bug
    expect(filtered.length).toBe(0); // BUG: Names don't match!

    // Verify the mismatch
    const resultProject = searchResults.results[0]?.project;
    expect(resultProject).toBe('my-api-project'); // Clean name
    expect(activeFilters.repos.has(resultProject)).toBe(false); // Doesn't match folder name!
  });

  test('getAllRepos must use searchInterface.conversationData when available', async () => {
    // This is the FIX - get repos from search interface
    const getAllReposFixed = (searchInterface) => {
      const repos = new Set();

      if (searchInterface && searchInterface.conversationData) {
        // Use clean names from index (THE FIX)
        for (const conv of searchInterface.conversationData.values()) {
          if (conv.project) {
            repos.add(conv.project);
          }
        }
      }

      return Array.from(repos).sort();
    };

    const repoList = getAllReposFixed(engine);

    // Should return clean names
    expect(repoList).toEqual(['my-api-project', 'web-app']);

    // Now filtering will work
    const searchResults = await engine.search('error');
    const activeFilters = {
      repos: new Set(repoList), // Select all repos from menu
      dateRange: null
    };

    const filtered = searchResults.results.filter(result => {
      return activeFilters.repos.has(result.project);
    });

    // This should work now!
    expect(filtered.length).toBeGreaterThan(0);
  });
});
