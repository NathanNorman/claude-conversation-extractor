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

  describe('JSONL File Scanning', () => {
    test('should index files without claude-conversation prefix', async () => {
      // Create JSONL files with various naming patterns
      const files = [
        { name: 'claude-conversation-2025-09-29-abc123.jsonl', sessionId: 'session-1' },
        { name: 'Debugging_Session_1.jsonl', sessionId: 'session-2' },
        { name: 'Project_Notes.jsonl', sessionId: 'session-3' },
        { name: '-Users-nathan-toast-analytics_2025-09-25.jsonl', sessionId: 'session-4' }
      ];

      for (const file of files) {
        const content = `{"type":"summary","summary":"Test Conversation","leafUuid":"${file.sessionId}"}
{"type":"user","message":{"role":"user","content":"Test message"},"timestamp":"2025-09-29T10:00:00.000Z","sessionId":"${file.sessionId}","uuid":"msg-1"}
{"type":"assistant","message":{"role":"assistant","content":"Test response"},"timestamp":"2025-09-29T10:00:01.000Z","sessionId":"${file.sessionId}","uuid":"msg-2"}`;
        await writeFile(join(exportDir, file.name), content);
      }

      const stats = await engine.buildIndex();

      expect(stats.totalDocuments).toBe(4);
      expect(stats.totalConversations).toBe(4);
    });

    test('should exclude documentation files', async () => {
      const validConversation = `{"type":"summary","summary":"Real Conversation","leafUuid":"real-uuid"}
{"type":"user","message":{"role":"user","content":"This is a real conversation."},"timestamp":"2025-09-29T10:00:00.000Z","sessionId":"real-session","uuid":"msg-1"}
{"type":"assistant","message":{"role":"assistant","content":"This is a response."},"timestamp":"2025-09-29T10:00:01.000Z","sessionId":"real-session","uuid":"msg-2"}`;

      await writeFile(join(exportDir, 'conversation.jsonl'), validConversation);
      await writeFile(join(exportDir, 'README.md'), '# Test content');
      await writeFile(join(exportDir, 'CHANGELOG.md'), '# Test content');
      await writeFile(join(exportDir, 'TODO.md'), '# Test content');
      await writeFile(join(exportDir, 'CLAUDE.md'), '# Test content');

      const stats = await engine.buildIndex();

      // Should only index conversation.jsonl, not the doc files
      expect(stats.totalDocuments).toBe(1);
    });

    test('should skip subdirectories (only scan root level)', async () => {
      // Create subdirectory structure
      const subdir1 = join(exportDir, 'toast-archiving');
      const subdir2 = join(exportDir, 'ynab-mcp');

      await mkdir(subdir1, { recursive: true });
      await mkdir(subdir2, { recursive: true });

      const content = `{"type":"summary","summary":"Test","leafUuid":"12345678-1234-1234-1234-123456789012"}
{"type":"user","message":{"role":"user","content":"Test"},"timestamp":"2025-09-29T10:00:00.000Z","sessionId":"12345678-1234-1234-1234-123456789012","uuid":"msg-1"}`;

      // Files in subdirectories should be ignored
      await writeFile(join(subdir1, 'conv1.jsonl'), content);
      await writeFile(join(subdir2, 'conv2.jsonl'), content);
      // Only root level file should be indexed
      await writeFile(join(exportDir, 'root-conv.jsonl'), content);

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
        const content = `{"type":"summary","summary":"Archived conversation ${i}","leafUuid":"archived-${i}"}
{"type":"user","message":{"role":"user","content":"Test ${i}"},"timestamp":"2025-09-29T10:00:00.000Z","sessionId":"session-${i}","uuid":"msg-${i}"}`;
        const filename = `archived-conv-${i}.jsonl`;
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
      const content = `{"type":"summary","summary":"Test","leafUuid":"test-uuid"}
{"type":"user","message":{"role":"user","content":"Test"},"timestamp":"2025-09-29T10:00:00.000Z","sessionId":"test-session","uuid":"msg-1"}`;
      await writeFile(join(exportDir, 'conv.jsonl'), content);

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
      const content = `{"type":"summary","summary":"Long Conversation","leafUuid":"long-uuid"}
{"type":"user","message":{"role":"user","content":"This is a long conversation with lots of content that should be indexed for searching and highlighting."},"timestamp":"2025-09-29T10:00:00.000Z","sessionId":"long-session","uuid":"msg-1"}
{"type":"assistant","message":{"role":"assistant","content":"Here is a detailed response with even more content."},"timestamp":"2025-09-29T10:00:01.000Z","sessionId":"long-session","uuid":"msg-2"}`;

      await writeFile(join(exportDir, 'test-conv.jsonl'), content);

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

  describe('JSONL Parsing', () => {
    test('should extract content from JSONL format', async () => {
      const content = `{"type":"summary","summary":"JavaScript Help","leafUuid":"abc123"}
{"type":"user","message":{"role":"user","content":"Can you help me with JavaScript?"},"timestamp":"2025-09-29T12:00:00.000Z","sessionId":"abc123","uuid":"msg-1"}
{"type":"assistant","message":{"role":"assistant","content":"Of course! I can help with JavaScript."},"timestamp":"2025-09-29T12:00:01.000Z","sessionId":"abc123","uuid":"msg-2"}`;

      await writeFile(join(exportDir, 'test.jsonl'), content);

      const stats = await engine.buildIndex();

      expect(stats.totalDocuments).toBe(1);

      // Search for content that should be indexed
      const result = await engine.search('JavaScript', { limit: 1 });
      expect(result.totalFound).toBeGreaterThan(0);
    });

    test('should handle malformed JSONL gracefully', async () => {
      const content = `Not a proper conversation format`;

      await writeFile(join(exportDir, 'malformed.jsonl'), content);

      const stats = await engine.buildIndex();

      // Should either skip or handle gracefully
      expect(stats.totalDocuments).toBeGreaterThanOrEqual(0);
    });
  });
});
