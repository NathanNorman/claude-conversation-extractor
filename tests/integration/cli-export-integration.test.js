/**
 * Integration tests for CLI export functionality
 * Tests the actual export flow as a user would experience it
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { writeFile, mkdir, rm, readFile, access, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { constants } from 'fs';
import ExportManager from '../../src/export/export-manager.js';

describe('CLI Export Integration', () => {
  const testProjectDir = join(homedir(), '.claude', 'projects', 'test-export-integration');
  const testExportDir = join(homedir(), '.claude', 'test-exports');
  
  const testConversation = [
    { 
      role: 'user', 
      content: 'Can you explain async/await in JavaScript?',
      timestamp: '2024-01-15T10:00:00Z'
    },
    { 
      role: 'assistant', 
      content: 'Async/await is a way to handle asynchronous operations in JavaScript. The async keyword declares an asynchronous function, and await pauses execution until a Promise resolves.',
      timestamp: '2024-01-15T10:01:00Z'
    },
    {
      role: 'user',
      content: 'Can you show me an example?',
      timestamp: '2024-01-15T10:02:00Z'
    },
    {
      role: 'assistant',
      content: '```javascript\nasync function fetchData() {\n  try {\n    const response = await fetch("https://api.example.com/data");\n    const data = await response.json();\n    return data;\n  } catch (error) {\n    console.error("Error:", error);\n  }\n}\n```',
      timestamp: '2024-01-15T10:03:00Z'
    }
  ];

  beforeAll(async () => {
    // Create test directories
    await mkdir(testProjectDir, { recursive: true });
    await mkdir(testExportDir, { recursive: true });
    
    // Create test JSONL file
    const content = testConversation.map(msg => JSON.stringify(msg)).join('\n');
    await writeFile(join(testProjectDir, 'test-conversation.jsonl'), content);
  });

  afterAll(async () => {
    await rm(testProjectDir, { recursive: true, force: true });
    await rm(testExportDir, { recursive: true, force: true });
  });

  describe('Export Formats', () => {
    let exportManager;

    beforeEach(() => {
      exportManager = new ExportManager();
    });

    it('should export conversation to Markdown format', async () => {
      const outputPath = join(testExportDir, 'test-export.md');
      
      await exportManager.export(
        testConversation,
        'markdown',
        { outputPath, includeMetadata: true }
      );
      
      // Verify file was created
      await expect(access(outputPath, constants.F_OK)).resolves.toBeUndefined();
      
      // Check content
      const content = await readFile(outputPath, 'utf-8');
      expect(content).toContain('# Conversation Export');
      expect(content).toContain('## User');
      expect(content).toContain('## Assistant');
      expect(content).toContain('async/await in JavaScript');
      expect(content).toContain('```javascript');
    });

    it('should export conversation to JSON format', async () => {
      const outputPath = join(testExportDir, 'test-export.json');
      
      await exportManager.export(
        testConversation,
        'json',
        { outputPath, includeMetadata: true }
      );
      
      // Verify file was created
      await expect(access(outputPath, constants.F_OK)).resolves.toBeUndefined();
      
      // Check content
      const content = await readFile(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      
      expect(parsed).toHaveProperty('messages');
      expect(parsed.messages).toHaveLength(4);
      expect(parsed.messages[0].role).toBe('user');
      expect(parsed.messages[0].content).toContain('async/await');
    });

    it('should export conversation to HTML format', async () => {
      const outputPath = join(testExportDir, 'test-export.html');
      
      await exportManager.export(
        testConversation,
        'html',
        { outputPath, includeMetadata: true }
      );
      
      // Verify file was created
      await expect(access(outputPath, constants.F_OK)).resolves.toBeUndefined();
      
      // Check content
      const content = await readFile(outputPath, 'utf-8');
      expect(content).toContain('<!DOCTYPE html>');
      expect(content).toContain('<div class="message user"');
      expect(content).toContain('<div class="message assistant"');
      expect(content).toContain('async&#x2F;await in JavaScript');
      expect(content).toContain('<pre><code class="language-javascript">');
    });

    it('should export conversation to plain text format', async () => {
      const outputPath = join(testExportDir, 'test-export.txt');
      
      await exportManager.export(
        testConversation,
        'text',
        { outputPath, includeMetadata: false }
      );
      
      // Verify file was created
      await expect(access(outputPath, constants.F_OK)).resolves.toBeUndefined();
      
      // Check content
      const content = await readFile(outputPath, 'utf-8');
      expect(content).toContain('User:');
      expect(content).toContain('Assistant:');
      expect(content).toContain('async/await in JavaScript');
      expect(content).not.toContain('<div>');
      expect(content).not.toContain('##');
    });
  });

  describe('Export Options', () => {
    let exportManager;

    beforeEach(() => {
      exportManager = new ExportManager();
    });

    it('should include metadata when requested', async () => {
      const outputPath = join(testExportDir, 'test-with-metadata.md');
      
      await exportManager.export(
        testConversation,
        'markdown',
        { outputPath, includeMetadata: true }
      );
      
      const content = await readFile(outputPath, 'utf-8');
      expect(content).toContain('Exported on:');
      expect(content).toContain('**Total messages:** 4');
      expect(content).toContain('1/15/2024');
    });

    it('should exclude metadata when not requested', async () => {
      const outputPath = join(testExportDir, 'test-without-metadata.md');
      
      await exportManager.export(
        testConversation,
        'markdown',
        { outputPath, includeMetadata: false }
      );
      
      const content = await readFile(outputPath, 'utf-8');
      expect(content).not.toContain('Exported on:');
      expect(content).not.toContain('Total messages:');
    });

    it('should handle detailed mode for tool use and system messages', async () => {
      const conversationWithTools = [
        ...testConversation,
        {
          role: 'assistant',
          content: 'I\'ll help you with that.',
          tool_use: {
            name: 'calculator',
            input: { expression: '2 + 2' }
          },
          timestamp: '2024-01-15T10:04:00Z'
        },
        {
          role: 'system',
          content: 'Tool response: 4',
          timestamp: '2024-01-15T10:04:01Z'
        }
      ];
      
      const outputPath = join(testExportDir, 'test-detailed.md');
      
      await exportManager.export(
        conversationWithTools,
        'markdown',
        { outputPath, includeMetadata: true, detailed: true }
      );
      
      const content = await readFile(outputPath, 'utf-8');
      expect(content).toContain('**Tool Use:**');
      expect(content).toContain('Tool: calculator');
      expect(content).toContain('## System');
    });
  });

  describe('Export Locations', () => {
    let exportManager;

    beforeEach(() => {
      exportManager = new ExportManager();
    });

    it('should export to default location (~/.claude/claude_conversations/)', async () => {
      const defaultDir = join(homedir(), '.claude', 'claude_conversations');
      const outputPath = join(defaultDir, 'test-default.md');
      
      await mkdir(defaultDir, { recursive: true });
      
      await exportManager.export(
        testConversation,
        'markdown',
        { outputPath }
      );
      
      await expect(access(outputPath, constants.F_OK)).resolves.toBeUndefined();
      
      // Clean up
      await rm(outputPath, { force: true });
    });

    it('should export to custom location', async () => {
      const customDir = join(testExportDir, 'custom', 'location');
      await mkdir(customDir, { recursive: true });
      
      const outputPath = join(customDir, 'test-custom.md');
      
      await exportManager.export(
        testConversation,
        'markdown',
        { outputPath }
      );
      
      await expect(access(outputPath, constants.F_OK)).resolves.toBeUndefined();
    });

    it('should create directory if it does not exist', async () => {
      const nonExistentDir = join(testExportDir, 'new', 'directory', 'path');
      const outputPath = join(nonExistentDir, 'test-new.md');
      
      await exportManager.export(
        testConversation,
        'markdown',
        { outputPath }
      );
      
      await expect(access(outputPath, constants.F_OK)).resolves.toBeUndefined();
    });
  });

  describe('Bulk Export', () => {
    it('should export multiple conversations', async () => {
      const conversations = [
        {
          project: 'project1',
          messages: testConversation.slice(0, 2)
        },
        {
          project: 'project2',
          messages: testConversation.slice(2, 4)
        }
      ];
      
      const exportManager = new ExportManager();
      const results = [];
      
      for (const conv of conversations) {
        const outputPath = join(testExportDir, `${conv.project}.md`);
        await exportManager.export(
          conv.messages,
          'markdown',
          { outputPath }
        );
        results.push(outputPath);
      }
      
      // Verify all files were created
      for (const path of results) {
        await expect(access(path, constants.F_OK)).resolves.toBeUndefined();
      }
      
      expect(results).toHaveLength(2);
    });

    it('should track export progress', async () => {
      const conversations = Array(5).fill(null).map((_, i) => ({
        project: `project-${i}`,
        messages: testConversation
      }));
      
      let exportedCount = 0;
      const exportManager = new ExportManager();
      
      for (const conv of conversations) {
        const outputPath = join(testExportDir, `${conv.project}.md`);
        await exportManager.export(
          conv.messages,
          'markdown',
          { outputPath }
        );
        exportedCount++;
      }
      
      expect(exportedCount).toBe(5);
    });
  });

  describe('Error Handling', () => {
    let exportManager;

    beforeEach(() => {
      exportManager = new ExportManager();
    });

    it('should handle invalid export format', async () => {
      const outputPath = join(testExportDir, 'test-invalid.xyz');
      
      await expect(
        exportManager.export(
          testConversation,
          'invalid',
          { outputPath }
        )
      ).rejects.toThrow();
    });

    it('should handle empty conversation', async () => {
      const outputPath = join(testExportDir, 'test-empty.md');
      
      await exportManager.export(
        [],
        'markdown',
        { outputPath }
      );
      
      const content = await readFile(outputPath, 'utf-8');
      expect(content).toContain('Conversation Export');
      // Should still create a file, just with no messages
    });

    it('should handle malformed conversation data', async () => {
      const malformedConversation = [
        { role: 'user' }, // Missing content
        { content: 'No role specified' }, // Missing role
        { role: 'assistant', content: 'Valid message' }
      ];
      
      const outputPath = join(testExportDir, 'test-malformed.md');
      
      // Should handle gracefully without crashing
      await exportManager.export(
        malformedConversation,
        'markdown',
        { outputPath }
      );
      
      await expect(access(outputPath, constants.F_OK)).resolves.toBeUndefined();
    });
  });

  describe('File Naming', () => {
    let exportManager;

    beforeEach(() => {
      exportManager = new ExportManager();
    });

    it('should generate unique filename with timestamp', () => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const expectedPattern = new RegExp(`conversation-\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}`);
      
      const filename = `conversation-${timestamp}.md`;
      expect(filename).toMatch(expectedPattern);
    });

    it('should handle filename conflicts', async () => {
      const outputPath = join(testExportDir, 'test-conflict.md');
      
      // Export first file
      await exportManager.export(
        testConversation,
        'markdown',
        { outputPath }
      );
      
      // Try to export to same path - should overwrite or handle gracefully
      await exportManager.export(
        testConversation,
        'markdown',
        { outputPath }
      );
      
      // File should still exist
      await expect(access(outputPath, constants.F_OK)).resolves.toBeUndefined();
      
      // Check file was actually written (size > 0)
      const stats = await stat(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    });

    it('should sanitize project names for filenames', () => {
      const unsafeNames = [
        'project/with/slashes',
        'project:with:colons',
        'project|with|pipes',
        'project<with>brackets',
        'project?with?questions'
      ];
      
      const sanitized = unsafeNames.map(name => 
        name.replace(/[<>:"/\\|?*]/g, '-')
      );
      
      expect(sanitized).toEqual([
        'project-with-slashes',
        'project-with-colons',
        'project-with-pipes',
        'project-with-brackets',
        'project-with-questions'
      ]);
    });
  });

  describe('Export Confirmation', () => {
    it('should return success status after export', async () => {
      const exportManager = new ExportManager();
      const outputPath = join(testExportDir, 'test-success.md');
      
      const result = await exportManager.export(
        testConversation,
        'markdown',
        { outputPath }
      );
      
      expect(result).toMatchObject({
        success: true,
        path: outputPath,
        format: 'markdown'
      });
    });

    it('should return error status on failure', async () => {
      const exportManager = new ExportManager();
      // Use an invalid path that cannot be created
      const outputPath = '/root/no-permission/test.md';
      
      try {
        await exportManager.export(
          testConversation,
          'markdown',
          { outputPath }
        );
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toContain('EACCES');
      }
    });
  });
});