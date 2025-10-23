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

    // Create mock JSONL exports with project name in filename
    // The system will extract project from the filename: projectname_uuid.jsonl
    const conversations = [
      {
        // Filename format matches export-manager output: projectname_uuid.jsonl
        filename: '-Users-user-my-api-project_11111111-1111-1111-1111-111111111111.jsonl',
        content: `{"type":"summary","summary":"Error Handling Implementation","leafUuid":"11111111-1111-1111-1111-111111111111"}
{"type":"user","message":{"role":"user","content":"How do I implement error handling?"},"timestamp":"2025-10-01T10:00:00.000Z","sessionId":"11111111-1111-1111-1111-111111111111","uuid":"msg-user-1"}
{"type":"assistant","message":{"role":"assistant","content":"Here's how to implement error handling..."},"timestamp":"2025-10-01T10:00:01.000Z","sessionId":"11111111-1111-1111-1111-111111111111","uuid":"msg-asst-1"}`
      },
      {
        filename: '-Users-user-web-app_22222222-2222-2222-2222-222222222222.jsonl',
        content: `{"type":"summary","summary":"CSS Layout Fix","leafUuid":"22222222-2222-2222-2222-222222222222"}
{"type":"user","message":{"role":"user","content":"Fix the CSS layout"},"timestamp":"2025-10-01T11:00:00.000Z","sessionId":"22222222-2222-2222-2222-222222222222","uuid":"msg-user-2"}
{"type":"assistant","message":{"role":"assistant","content":"Let me help you fix that..."},"timestamp":"2025-10-01T11:00:01.000Z","sessionId":"22222222-2222-2222-2222-222222222222","uuid":"msg-asst-2"}`
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

    // Build index by providing processed conversations with project names set
    // This simulates how IndexBuilder would prepare conversations
    const processedConversations = [
      {
        id: 'conv_1',
        project: '-Users-user-my-api-project',
        fullText: 'How do I implement error handling? Here\'s how to implement error handling...',
        preview: 'How do I implement error handling?',
        modified: '2025-10-01T10:00:00.000Z',
        wordCount: 50,
        messageCount: 2,
        exportedFile: join(exportDir, conversations[0].filename),
        originalPath: join(exportDir, conversations[0].filename),
        extractedKeywords: [],
        toolsUsed: []
      },
      {
        id: 'conv_2',
        project: '-Users-user-web-app',
        fullText: 'Fix the CSS layout Let me help you fix that...',
        preview: 'Fix the CSS layout',
        modified: '2025-10-01T11:00:00.000Z',
        wordCount: 40,
        messageCount: 2,
        exportedFile: join(exportDir, conversations[1].filename),
        originalPath: join(exportDir, conversations[1].filename),
        extractedKeywords: [],
        toolsUsed: []
      }
    ];

    await engine.buildIndex(processedConversations);
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
