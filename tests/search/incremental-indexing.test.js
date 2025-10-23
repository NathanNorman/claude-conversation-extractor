/**
 * Tests for Incremental Index Updates
 */

import { jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import { MiniSearchEngine } from '../../src/search/minisearch-engine.js';
import { createTestEnv } from '../utils/test-helpers.js';

describe('Incremental Indexing', () => {
  let testEnv;
  let miniSearch;

  beforeEach(async () => {
    testEnv = await createTestEnv();
    miniSearch = new MiniSearchEngine({
      exportDir: testEnv.conversationsDir,
      indexPath: path.join(testEnv.conversationsDir, 'search-index-v2.json')
    });
  });

  afterEach(async () => {
    await testEnv.cleanup();
  });

  describe('updateIndex()', () => {
    test('should add only new files to existing index', async () => {
      // Create initial files
      const file1 = path.join(testEnv.conversationsDir, 'conv1.jsonl');
      await fs.writeFile(file1, `{"type":"summary","summary":"Test 1","leafUuid":"11111111-1111-1111-1111-111111111111"}
{"type":"user","message":{"role":"user","content":"Test message 1"},"timestamp":"2025-10-01T10:00:00.000Z","sessionId":"11111111-1111-1111-1111-111111111111","uuid":"msg-1"}`);

      // Build initial index
      await miniSearch.buildIndex();
      await miniSearch.saveIndex();

      const initialStats = miniSearch.getStats();
      expect(initialStats.totalConversations).toBe(1);

      // Wait a moment to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 100));

      // Add a new file
      const file2 = path.join(testEnv.conversationsDir, 'conv2.jsonl');
      await fs.writeFile(file2, `{"type":"summary","summary":"Test 2","leafUuid":"22222222-2222-2222-2222-222222222222"}
{"type":"user","message":{"role":"user","content":"Test message 2"},"timestamp":"2025-10-01T10:00:00.000Z","sessionId":"22222222-2222-2222-2222-222222222222","uuid":"msg-2"}`);

      // Load index and do incremental update
      await miniSearch.loadIndex();
      const updateResult = await miniSearch.updateIndex();

      expect(updateResult.newFiles).toBe(1);
      expect(updateResult.totalConversations).toBe(2);
    });

    test('should skip files already in index', async () => {
      // Create and index a file
      const file1 = path.join(testEnv.conversationsDir, 'conv1.jsonl');
      await fs.writeFile(file1, `{"type":"summary","summary":"Test","leafUuid":"11111111-1111-1111-1111-111111111111"}
{"type":"user","message":{"role":"user","content":"Test message"},"timestamp":"2025-10-01T10:00:00.000Z","sessionId":"11111111-1111-1111-1111-111111111111","uuid":"msg-1"}`);

      await miniSearch.buildIndex();
      await miniSearch.saveIndex();

      // Try to update without new files
      await miniSearch.loadIndex();
      const result = await miniSearch.updateIndex();

      expect(result.newFiles).toBe(0);
    });

    test('should detect modified files based on timestamp', async () => {
      const file1 = path.join(testEnv.conversationsDir, 'conv1.jsonl');
      await fs.writeFile(file1, `{"type":"summary","summary":"Original","leafUuid":"11111111-1111-1111-1111-111111111111"}
{"type":"user","message":{"role":"user","content":"Original message"},"timestamp":"2025-10-01T10:00:00.000Z","sessionId":"11111111-1111-1111-1111-111111111111","uuid":"msg-1"}`);

      await miniSearch.buildIndex();
      await miniSearch.saveIndex();

      // Wait to ensure file mtime will be newer
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Modify the file (touch will update mtime)
      await fs.writeFile(file1, `{"type":"summary","summary":"Updated","leafUuid":"11111111-1111-1111-1111-111111111111"}
{"type":"user","message":{"role":"user","content":"Updated message with more content"},"timestamp":"2025-10-01T10:00:00.000Z","sessionId":"11111111-1111-1111-1111-111111111111","uuid":"msg-1"}`);

      // Update index
      await miniSearch.loadIndex();
      const result = await miniSearch.updateIndex();

      // File should be detected as modified and processed
      expect(result.newFiles + (result.updatedFiles || 0)).toBeGreaterThan(0);
    });
  });

  describe('smartUpdate()', () => {
    test('should do incremental update for few new files', async () => {
      // Create initial files
      for (let i = 1; i <= 10; i++) {
        const file = path.join(testEnv.conversationsDir, `conv${i}.jsonl`);
        const sessionId = `${i}${i}${i}${i}${i}${i}${i}${i}-1111-1111-1111-111111111111`;
        await fs.writeFile(file, `{"type":"summary","summary":"Test ${i}","leafUuid":"${sessionId}"}
{"type":"user","message":{"role":"user","content":"Test ${i}"},"timestamp":"2025-10-01T10:00:00.000Z","sessionId":"${sessionId}","uuid":"msg-${i}"}`);
      }

      await miniSearch.buildIndex();
      await miniSearch.saveIndex();

      // Wait and add 1 new file (10% - below 20% threshold)
      await new Promise(resolve => setTimeout(resolve, 100));
      const newFile = path.join(testEnv.conversationsDir, 'conv11.jsonl');
      await fs.writeFile(newFile, `{"type":"summary","summary":"New conversation","leafUuid":"11111111-1111-1111-1111-111111111111"}
{"type":"user","message":{"role":"user","content":"New conversation"},"timestamp":"2025-10-01T10:00:00.000Z","sessionId":"11111111-1111-1111-1111-111111111111","uuid":"msg-11"}`);

      await miniSearch.loadIndex();
      const result = await miniSearch.smartUpdate();

      expect(result.method).toBe('incremental');
      expect(result.newFiles).toBe(1);
    });

    test('should do full rebuild for many new files', async () => {
      // Create initial files
      for (let i = 1; i <= 10; i++) {
        const file = path.join(testEnv.conversationsDir, `conv${i}.jsonl`);
        const sessionId = `${i}${i}${i}${i}${i}${i}${i}${i}-1111-1111-1111-111111111111`;
        await fs.writeFile(file, `{"type":"summary","summary":"Test ${i}","leafUuid":"${sessionId}"}
{"type":"user","message":{"role":"user","content":"Test ${i}"},"timestamp":"2025-10-01T10:00:00.000Z","sessionId":"${sessionId}","uuid":"msg-${i}"}`);
      }

      await miniSearch.buildIndex();
      await miniSearch.saveIndex();

      // Wait and add 5 new files (50% - above 20% threshold)
      await new Promise(resolve => setTimeout(resolve, 100));
      for (let i = 11; i <= 15; i++) {
        const file = path.join(testEnv.conversationsDir, `conv${i}.jsonl`);
        const sessionId = `${i}${i}${i}${i}${i}${i}${i}${i}-1111-1111-1111-111111111111`;
        await fs.writeFile(file, `{"type":"summary","summary":"Test ${i}","leafUuid":"${sessionId}"}
{"type":"user","message":{"role":"user","content":"Test ${i}"},"timestamp":"2025-10-01T10:00:00.000Z","sessionId":"${sessionId}","uuid":"msg-${i}"}`);
      }

      await miniSearch.loadIndex();
      const result = await miniSearch.smartUpdate();

      expect(result.method).toBe('full_rebuild');
      expect(result.totalConversations).toBe(15);
    });
  });

  describe('getDisplayName()', () => {
    test('should clean project names with any username (generic pattern)', () => {
      // Works for any username, not just hardcoded ones
      expect(miniSearch.getDisplayName('-Users-alice-my-project')).toBe('my-project');
      expect(miniSearch.getDisplayName('-Users-bob-api-server')).toBe('api-server');
      expect(miniSearch.getDisplayName('Users-charlie-web-app')).toBe('web-app');
    });

    test('should handle home directory for any user', () => {
      expect(miniSearch.getDisplayName('-Users-alice')).toBe('~ (home)');
      expect(miniSearch.getDisplayName('Users-bob')).toBe('~ (home)');
    });

    test('should handle edge cases', () => {
      expect(miniSearch.getDisplayName('')).toBe('Unknown');
      expect(miniSearch.getDisplayName(null)).toBe('Unknown');
      expect(miniSearch.getDisplayName('already-clean-name')).toBe('already-clean-name');
    });
  });
});
