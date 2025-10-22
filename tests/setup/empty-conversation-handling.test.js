/**
 * Tests for empty conversation handling in bulk extractor
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { writeFile, mkdir, rm, readFile, access } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import BulkExtractor from '../../src/setup/bulk-extractor.js';

describe('Empty Conversation Handling', () => {
  let testDir;
  let projectsDir;
  let exportDir;
  let bulkExtractor;

  beforeEach(async () => {
    testDir = join(tmpdir(), 'test-empty-conversations-' + Date.now());
    projectsDir = join(testDir, 'projects');
    exportDir = join(testDir, 'exports');
    
    await mkdir(projectsDir, { recursive: true });
    await mkdir(exportDir, { recursive: true });
    
    bulkExtractor = new BulkExtractor({
      projectsDir,
      outputDir: exportDir,
      logger: { 
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn()
      }
    });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('Empty conversation detection', () => {
    it('should detect conversations with no messages', async () => {
      // Create an empty conversation file
      const emptyConversation = join(projectsDir, 'empty-project.jsonl');
      await writeFile(emptyConversation, '');
      
      const conversation = {
        path: emptyConversation,
        project: 'empty-project',
        modified: Date.now()
      };
      
      // Attempt to export
      await expect(bulkExtractor.exportSingleConversation(conversation, exportDir))
        .rejects.toThrow('No messages found in conversation');
      
      // Check that it was added to empty conversations list
      expect(bulkExtractor.emptyConversations).toHaveLength(1);
      expect(bulkExtractor.emptyConversations[0]).toMatchObject({
        path: emptyConversation,
        project: 'empty-project',
        reason: 'No messages found in conversation'
      });
    });

    it('should detect conversations with only invalid JSON', async () => {
      const invalidConversation = join(projectsDir, 'invalid-project.jsonl');
      await writeFile(invalidConversation, 'not valid json\n{broken json}\n');
      
      const conversation = {
        path: invalidConversation,
        project: 'invalid-project',
        modified: Date.now()
      };
      
      await expect(bulkExtractor.exportSingleConversation(conversation, exportDir))
        .rejects.toThrow('No valid messages found');
      
      expect(bulkExtractor.emptyConversations).toHaveLength(1);
      expect(bulkExtractor.emptyConversations[0].reason).toContain('parse errors');
    });

    it('should detect conversations with only meta messages', async () => {
      const metaOnlyConversation = join(projectsDir, 'meta-only-project.jsonl');
      const metaContent = [
        { type: 'meta', message: 'System message' },
        { type: 'system', message: 'Another system message' },
        { type: 'user', isMeta: true, message: { content: 'Meta user message' } }
      ].map(m => JSON.stringify(m)).join('\n');
      
      await writeFile(metaOnlyConversation, metaContent);
      
      const conversation = {
        path: metaOnlyConversation,
        project: 'meta-only-project',
        modified: Date.now()
      };
      
      await expect(bulkExtractor.exportSingleConversation(conversation, exportDir))
        .rejects.toThrow('No messages found in conversation');
    });
  });

  describe('Deletion behavior', () => {
    it('should silently delete empty conversations', async () => {
      const emptyConversation = join(projectsDir, 'test-empty.jsonl');
      await writeFile(emptyConversation, '');

      const conversation = {
        path: emptyConversation,
        project: 'test-empty',
        modified: Date.now()
      };

      await expect(bulkExtractor.exportSingleConversation(conversation, exportDir))
        .rejects.toThrow('No messages found');

      // File should be deleted automatically
      await expect(access(emptyConversation)).rejects.toThrow('ENOENT');

      // Deletion should have been tracked
      expect(bulkExtractor.deletedCount).toBe(1);
    });
  });

  describe('Bulk extraction with empty conversations', () => {
    it('should handle mixed valid and empty conversations', async () => {
      // Create a valid conversation
      const validConversation = join(projectsDir, 'valid-project.jsonl');
      await writeFile(validConversation, JSON.stringify({
        type: 'user',
        message: { role: 'user', content: 'Test message' }
      }));
      
      // Create an empty conversation
      const emptyConversation = join(projectsDir, 'empty-project.jsonl');
      await writeFile(emptyConversation, '');
      
      const conversations = [
        { path: validConversation, project: 'valid-project', modified: Date.now() },
        { path: emptyConversation, project: 'empty-project', modified: Date.now() }
      ];
      
      const result = await bulkExtractor.extractAllConversations(conversations, exportDir);
      
      expect(result.processed).toBe(2);
      expect(result.extracted).toBe(1); // Only valid conversation exported
      expect(result.failed).toBe(1); // Empty conversation failed
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('No messages found');
    });
  });

  describe('Empty conversation tracking', () => {
    it('should track deleted count', () => {
      expect(bulkExtractor.deletedCount).toBe(0);

      bulkExtractor.deletedCount = 5;
      expect(bulkExtractor.deletedCount).toBe(5);
    });

    it('should return empty conversations in results', async () => {
      const emptyConversation = join(projectsDir, 'empty.jsonl');
      await writeFile(emptyConversation, '');

      const conversations = [
        { path: emptyConversation, project: 'empty', modified: Date.now() }
      ];

      const result = await bulkExtractor.extractAllConversations(conversations, exportDir);

      expect(result.emptyConversations).toBeDefined();
      expect(result.emptyConversations).toHaveLength(1);
      expect(result.emptyConversations[0].project).toBe('empty');
      expect(result.deleted).toBe(1); // Should have deleted it
    });
  });
});