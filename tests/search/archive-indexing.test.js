import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { MiniSearchEngine } from '../../src/search/minisearch-engine.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Archive Conversation Indexing', () => {
  let testDir;
  let exportDir;
  let engine;

  beforeEach(async () => {
    testDir = join(tmpdir(), `archive-test-${Date.now()}`);
    exportDir = join(testDir, 'exports');
    await mkdir(exportDir, { recursive: true });

    engine = new MiniSearchEngine({
      exportDir: exportDir,
      indexPath: join(testDir, 'search-index-v2.json')
    });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Markdown File Scanning', () => {
    test('should index files without claude-conversation prefix', async () => {
      // Create markdown files with various naming patterns
      const files = [
        'claude-conversation-2025-09-29-abc123.md',
        'Debugging_Session_1.md',
        'Project_Notes.md',
        '-Users-nathan-toast-analytics_2025-09-25.md'
      ];

      for (const file of files) {
        const content = `# Claude Conversation\n\nProject: test\nDate: 2025-09-29\n\n## 👤 User\n\nTest message\n\n## 🤖 Assistant\n\nTest response`;
        await writeFile(join(exportDir, file), content);
      }

      const stats = await engine.buildIndex();

      expect(stats.totalDocuments).toBe(4);
      expect(stats.totalConversations).toBe(4);
    });

    test('should exclude documentation files', async () => {
      const validConversation = `# Claude Conversation

Project: test-project
Date: 2025-09-29

## 👤 User

This is a real conversation.

## 🤖 Assistant

This is a response.`;

      await writeFile(join(exportDir, 'conversation.md'), validConversation);
      await writeFile(join(exportDir, 'README.md'), '# Test content');
      await writeFile(join(exportDir, 'CHANGELOG.md'), '# Test content');
      await writeFile(join(exportDir, 'TODO.md'), '# Test content');
      await writeFile(join(exportDir, 'CLAUDE.md'), '# Test content');

      const stats = await engine.buildIndex();

      // Should only index conversation.md, not the doc files
      expect(stats.totalDocuments).toBe(1);
    });

    test('should skip subdirectories (only scan root level)', async () => {
      // Create subdirectory structure
      const subdir1 = join(exportDir, 'toast-archiving');
      const subdir2 = join(exportDir, 'ynab-mcp');

      await mkdir(subdir1, { recursive: true });
      await mkdir(subdir2, { recursive: true });

      const content = `# Claude Conversation\n\nProject: test\nSession ID: 12345678-1234-1234-1234-123456789012\n\n## 👤 User\n\nTest`;

      // Files in subdirectories should be ignored
      await writeFile(join(subdir1, 'conv1.md'), content);
      await writeFile(join(subdir2, 'conv2.md'), content);
      // Only root level file should be indexed
      await writeFile(join(exportDir, 'root-conv.md'), content);

      const stats = await engine.buildIndex();

      // Should only index root level file, not subdirectories
      expect(stats.totalDocuments).toBe(1);
    });
  });

  describe('Archive Detection', () => {
    test('should detect archive index (more indexed than active JSONL)', async () => {
      // Create index with many conversations
      const conversations = [];
      for (let i = 0; i < 500; i++) {
        const content = `# Claude Conversation\n\nProject: archived-${i}\n\n## 👤 User\n\nTest ${i}`;
        const filename = `archived-conv-${i}.md`;
        await writeFile(join(exportDir, filename), content);
      }

      await engine.buildIndex();
      await engine.saveIndex();

      // Reload and check needsRebuild
      const engine2 = new MiniSearchEngine({
        exportDir: exportDir,
        indexPath: join(testDir, 'search-index-v2.json'),
        projectsDir: testDir // Only 0 JSONL files here
      });

      await engine2.loadIndex();
      const needsRebuild = await engine2.needsRebuild();

      // Should NOT need rebuild (archive mode)
      expect(needsRebuild).toBe(false);
    });

    test('should rebuild when JSONL files are newer for non-archive', async () => {
      // Create small index (not an archive)
      const content = `# Claude Conversation\n\nProject: test\n\n## 👤 User\n\nTest`;
      await writeFile(join(exportDir, 'conv.md'), content);

      await engine.buildIndex();
      await engine.saveIndex();

      // Wait a bit then create a newer JSONL file
      await new Promise(resolve => setTimeout(resolve, 10));

      const projectsDir = join(testDir, 'projects', 'test-project');
      await mkdir(projectsDir, { recursive: true });
      await writeFile(join(projectsDir, 'chat.jsonl'), '{"type":"user","message":{"content":"test"}}');

      const engine2 = new MiniSearchEngine({
        exportDir: exportDir,
        indexPath: join(testDir, 'search-index-v2.json'),
        projectsDir: join(testDir, 'projects')
      });

      await engine2.loadIndex();
      const needsRebuild = await engine2.needsRebuild();

      // Should need rebuild (newer JSONL exists and not an archive)
      expect(needsRebuild).toBe(true);
    });
  });

  describe('Full Text Storage', () => {
    test('should store fullText in index for instant highlighting', async () => {
      const content = `# Claude Conversation\n\nProject: test\nDate: 2025-09-29\n\n## 👤 User\n\nThis is a long conversation with lots of content that should be indexed for searching and highlighting.\n\n## 🤖 Assistant\n\nHere is a detailed response with even more content.`;

      await writeFile(join(exportDir, 'test-conv.md'), content);

      await engine.buildIndex();
      await engine.saveIndex();

      // Reload and search
      const engine2 = new MiniSearchEngine({
        exportDir: exportDir,
        indexPath: join(testDir, 'search-index-v2.json')
      });

      await engine2.loadIndex();
      const result = await engine2.search('highlighting', { limit: 1 });

      expect(result.results.length).toBeGreaterThan(0);
      if (result.results.length > 0) {
        expect(result.results[0].fullText).toBeTruthy();
        expect(result.results[0].fullText.length).toBeGreaterThan(100);
      }
    });
  });

  describe('Markdown Parsing', () => {
    test('should extract content from markdown format', async () => {
      const content = `# Claude Conversation

Project: test-project
Session ID: abc123
Date: 2025-09-29T12:00:00.000Z

---

## 👤 User

Can you help me with JavaScript?

## 🤖 Assistant

Of course! I can help with JavaScript.`;

      await writeFile(join(exportDir, 'test.md'), content);

      const stats = await engine.buildIndex();

      expect(stats.totalDocuments).toBe(1);

      // Search for content that should be indexed
      const result = await engine.search('JavaScript', { limit: 1 });
      expect(result.totalFound).toBeGreaterThan(0);
    });

    test('should handle malformed markdown gracefully', async () => {
      const content = `Not a proper conversation format`;

      await writeFile(join(exportDir, 'malformed.md'), content);

      const stats = await engine.buildIndex();

      // Should either skip or handle gracefully
      expect(stats.totalDocuments).toBeGreaterThanOrEqual(0);
    });
  });
});
