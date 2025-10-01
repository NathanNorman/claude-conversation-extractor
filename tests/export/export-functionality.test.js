/**
 * Export Functionality Test Suite
 * Tests for exporting conversations in various formats
 */

import { jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import { 
  createTestEnv,
  ConsoleCapture,
  delay
} from '../utils/test-helpers.js';
import {
  createMockConversation,
  createMockConversationSet,
  createMockJsonlFile,
  createMockToolUse,
  createMockMcpResponse
} from '../utils/mock-factories.js';
import { SAMPLE_CONVERSATIONS, EXPORT_TEST_CASES } from '../fixtures/conversation-fixtures.js';

// Mock export modules
let MarkdownExporter;
let JsonExporter;
let HtmlExporter;
let ExportManager;

beforeAll(async () => {
  // Dynamic imports for export modules
  MarkdownExporter = (await import('../../src/export/markdown-exporter.js')).default;
  JsonExporter = (await import('../../src/export/json-exporter.js')).default;
  HtmlExporter = (await import('../../src/export/html-exporter.js')).default;
  ExportManager = (await import('../../src/export/export-manager.js')).default;
});

describe('Export Functionality', () => {
  let testEnv;
  let consoleCapture;

  beforeEach(async () => {
    testEnv = await createTestEnv();
    consoleCapture = new ConsoleCapture();
  });

  afterEach(async () => {
    consoleCapture.stop();
    await testEnv.cleanup();
  });

  describe('Markdown Export', () => {
    let markdownExporter;

    beforeEach(() => {
      markdownExporter = new MarkdownExporter({
        outputDir: testEnv.conversationsDir,
        logger: {
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          debug: jest.fn()
        }
      });
    });

    test('should export simple conversation to markdown', async () => {
      const outputPath = path.join(testEnv.conversationsDir, 'simple.md');
      
      await markdownExporter.export(SAMPLE_CONVERSATIONS.simple, outputPath);
      
      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toContain('# Simple Chat');
      expect(content).toContain('**Human:**');
      expect(content).toContain('What is JavaScript?');
      expect(content).toContain('**Assistant:**');
      expect(content).toContain('JavaScript is a programming language');
    });

    test('should include timestamps when requested', async () => {
      const outputPath = path.join(testEnv.conversationsDir, 'with-timestamps.md');
      
      await markdownExporter.export(SAMPLE_CONVERSATIONS.simple, outputPath, {
        includeTimestamps: true
      });
      
      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toMatch(/\d{4}-\d{2}-\d{2}/); // Date format
      expect(content).toMatch(/\d{2}:\d{2}:\d{2}/); // Time format
    });

    test('should export tool use in detailed mode', async () => {
      const outputPath = path.join(testEnv.conversationsDir, 'tools.md');
      
      await markdownExporter.export(SAMPLE_CONVERSATIONS.withTools, outputPath, {
        detailed: true
      });
      
      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toContain('**Tool Use:**');
      expect(content).toContain('read_file');
      expect(content).toContain('Input:');
      expect(content).toContain('Output:');
      expect(content).toContain('/project/config.json');
    });

    test('should export MCP responses in detailed mode', async () => {
      const outputPath = path.join(testEnv.conversationsDir, 'mcp.md');
      
      await markdownExporter.export(SAMPLE_CONVERSATIONS.withMcp, outputPath, {
        detailed: true
      });
      
      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toContain('**MCP Response:**');
      expect(content).toContain('database-server');
      expect(content).toContain('SELECT * FROM users');
    });

    test('should handle code blocks properly', async () => {
      const outputPath = path.join(testEnv.conversationsDir, 'code.md');
      
      await markdownExporter.export(SAMPLE_CONVERSATIONS.withCodeBlocks, outputPath);
      
      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toContain('```python');
      expect(content).toContain('def calculate_average');
      expect(content).toContain('```');
    });

    test('should handle attachments', async () => {
      const outputPath = path.join(testEnv.conversationsDir, 'attachments.md');
      
      await markdownExporter.export(SAMPLE_CONVERSATIONS.withAttachments, outputPath, {
        detailed: true
      });
      
      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toContain('**Attachments:**');
      expect(content).toContain('/docs/readme.md');
      expect(content).toContain('/docs/api.md');
    });

    test('should sanitize filenames', async () => {
      const conversation = {
        ...SAMPLE_CONVERSATIONS.simple,
        name: 'Test/With\\Special*Characters?'
      };
      
      const outputPath = await markdownExporter.export(conversation);
      
      // Check that the filename portion doesn't contain invalid characters
      expect(path.basename(outputPath)).not.toMatch(/[\/\\*?]/);
      const exists = await fs.exists(outputPath);
      expect(exists).toBe(true);
    });

    test('should handle very long conversations', async () => {
      const outputPath = path.join(testEnv.conversationsDir, 'long.md');
      
      await markdownExporter.export(SAMPLE_CONVERSATIONS.longConversation, outputPath);
      
      const content = await fs.readFile(outputPath, 'utf-8');
      const messageCount = (content.match(/\*\*Human:\*\*/g) || []).length;
      expect(messageCount).toBe(25); // 50 messages total, 25 human
    });

    test('should add metadata header', async () => {
      const outputPath = path.join(testEnv.conversationsDir, 'metadata.md');
      
      await markdownExporter.export(SAMPLE_CONVERSATIONS.simple, outputPath, {
        includeMetadata: true
      });
      
      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toContain('---');
      expect(content).toContain('title:');
      expect(content).toContain('created:');
      expect(content).toContain('updated:');
      expect(content).toContain('messages:');
    });
  });

  describe('JSON Export', () => {
    let jsonExporter;

    beforeEach(() => {
      jsonExporter = new JsonExporter({
        outputDir: testEnv.conversationsDir,
        logger: {
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          debug: jest.fn()
        }
      });
    });

    test('should export conversation to JSON', async () => {
      const outputPath = path.join(testEnv.conversationsDir, 'simple.json');
      
      await jsonExporter.export(SAMPLE_CONVERSATIONS.simple, outputPath);
      
      const content = await fs.readJson(outputPath);
      expect(content.id).toBe('conv-simple-1');
      expect(content.name).toBe('Simple Chat');
      expect(content.messages).toHaveLength(2);
      expect(content.messages[0].role).toBe('human');
    });

    test('should preserve all data in detailed mode', async () => {
      const outputPath = path.join(testEnv.conversationsDir, 'detailed.json');
      
      await jsonExporter.export(SAMPLE_CONVERSATIONS.withTools, outputPath, {
        detailed: true
      });
      
      const content = await fs.readJson(outputPath);
      expect(content.messages[1].tool_use).toBeDefined();
      expect(content.messages[1].tool_use.tool_name).toBe('read_file');
    });

    test('should support pretty printing', async () => {
      const outputPath = path.join(testEnv.conversationsDir, 'pretty.json');
      
      await jsonExporter.export(SAMPLE_CONVERSATIONS.simple, outputPath, {
        pretty: true
      });
      
      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toContain('\n  '); // Indentation
      expect(content.split('\n').length).toBeGreaterThan(10); // Multiple lines
    });

    test('should support minified output', async () => {
      const outputPath = path.join(testEnv.conversationsDir, 'minified.json');
      
      await jsonExporter.export(SAMPLE_CONVERSATIONS.simple, outputPath, {
        pretty: false
      });
      
      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content.split('\n').length).toBe(1); // Single line
    });

    test('should handle circular references', async () => {
      const conversation = {
        ...SAMPLE_CONVERSATIONS.simple,
        circular: null
      };
      conversation.circular = conversation; // Create circular reference
      
      const outputPath = path.join(testEnv.conversationsDir, 'circular.json');
      
      await jsonExporter.export(conversation, outputPath);
      
      const content = await fs.readJson(outputPath);
      expect(content).toBeDefined();
      expect(content.circular).toBeUndefined(); // Circular reference removed
    });

    test('should export multiple conversations to single file', async () => {
      const outputPath = path.join(testEnv.conversationsDir, 'multiple.json');
      const conversations = [
        SAMPLE_CONVERSATIONS.simple,
        SAMPLE_CONVERSATIONS.withTools,
        SAMPLE_CONVERSATIONS.withMcp
      ];
      
      await jsonExporter.exportMultiple(conversations, outputPath);
      
      const content = await fs.readJson(outputPath);
      expect(Array.isArray(content)).toBe(true);
      expect(content).toHaveLength(3);
    });

    test('should support JSON Lines format', async () => {
      const outputPath = path.join(testEnv.conversationsDir, 'lines.jsonl');
      const conversations = createMockConversationSet({ count: 3 });
      
      await jsonExporter.exportMultiple(conversations, outputPath, {
        format: 'jsonl'
      });
      
      const content = await fs.readFile(outputPath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(3);
      
      // Each line should be valid JSON
      lines.forEach(line => {
        expect(() => JSON.parse(line)).not.toThrow();
      });
    });
  });

  describe('HTML Export', () => {
    let htmlExporter;

    beforeEach(() => {
      htmlExporter = new HtmlExporter({
        outputDir: testEnv.conversationsDir,
        logger: {
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          debug: jest.fn()
        }
      });
    });

    test('should export conversation to HTML', async () => {
      const outputPath = path.join(testEnv.conversationsDir, 'simple.html');
      
      await htmlExporter.export(SAMPLE_CONVERSATIONS.simple, outputPath);
      
      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toContain('<html>');
      expect(content).toContain('<title>Simple Chat</title>');
      expect(content).toContain('class="message human"');
      expect(content).toContain('class="message assistant"');
      expect(content).toContain('What is JavaScript?');
    });

    test('should include CSS styling', async () => {
      const outputPath = path.join(testEnv.conversationsDir, 'styled.html');
      
      await htmlExporter.export(SAMPLE_CONVERSATIONS.simple, outputPath);
      
      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toContain('<style>');
      expect(content).toContain('.message');
      expect(content).toContain('.human');
      expect(content).toContain('.assistant');
    });

    test('should handle code blocks with syntax highlighting', async () => {
      const outputPath = path.join(testEnv.conversationsDir, 'code.html');
      
      await htmlExporter.export(SAMPLE_CONVERSATIONS.withCodeBlocks, outputPath);
      
      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toContain('<pre><code');
      expect(content).toContain('class="language-python"');
      expect(content).toContain('calculate_average');
    });

    test('should support dark mode theme', async () => {
      const outputPath = path.join(testEnv.conversationsDir, 'dark.html');
      
      await htmlExporter.export(SAMPLE_CONVERSATIONS.simple, outputPath, {
        theme: 'dark'
      });
      
      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toContain('dark-theme');
      expect(content).toContain('background-color: #1a1a1a');
    });

    test('should include navigation for long conversations', async () => {
      const outputPath = path.join(testEnv.conversationsDir, 'nav.html');
      
      await htmlExporter.export(SAMPLE_CONVERSATIONS.longConversation, outputPath, {
        includeNavigation: true
      });
      
      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toContain('class="navigation"');
      expect(content).toContain('href="#message-');
    });

    test('should escape HTML in messages', async () => {
      const conversation = {
        ...SAMPLE_CONVERSATIONS.simple,
        messages: [
          { role: 'human', content: '<script>alert("XSS")</script>' },
          { role: 'assistant', content: 'HTML tags: <div>, <span>, <img>' }
        ]
      };
      
      const outputPath = path.join(testEnv.conversationsDir, 'escaped.html');
      await htmlExporter.export(conversation, outputPath);
      
      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).not.toContain('<script>alert');
      expect(content).toContain('&lt;script&gt;');
      expect(content).toContain('&lt;div&gt;');
    });

    test('should support print-friendly layout', async () => {
      const outputPath = path.join(testEnv.conversationsDir, 'print.html');
      
      await htmlExporter.export(SAMPLE_CONVERSATIONS.simple, outputPath, {
        printFriendly: true
      });
      
      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toContain('@media print');
      expect(content).toContain('page-break-inside: avoid');
    });
  });

  describe('Export Manager', () => {
    let exportManager;

    beforeEach(() => {
      exportManager = new ExportManager({
        outputDir: testEnv.conversationsDir,
        projectsDir: testEnv.projectsDir,
        logger: {
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          debug: jest.fn()
        }
      });
    });

    test('should select correct exporter based on format', async () => {
      const conversation = SAMPLE_CONVERSATIONS.simple;
      
      // Test markdown
      const mdResult = await exportManager.export(conversation, 'markdown');
      expect(mdResult.success).toBe(true);
      expect(mdResult.path.endsWith('.md')).toBe(true);
      
      // Test JSON
      const jsonResult = await exportManager.export(conversation, 'json');
      expect(jsonResult.success).toBe(true);
      expect(jsonResult.path.endsWith('.json')).toBe(true);
      
      // Test HTML
      const htmlResult = await exportManager.export(conversation, 'html');
      expect(htmlResult.success).toBe(true);
      expect(htmlResult.path.endsWith('.html')).toBe(true);
    });

    test('should handle bulk export', async () => {
      const conversations = createMockConversationSet({ count: 5 });
      
      const results = await exportManager.exportBulk(conversations, 'markdown');
      
      expect(results.success).toBe(true);
      expect(results.exported).toBe(5);
      expect(results.failed).toBe(0);
      expect(results.paths).toHaveLength(5);
    });

    test('should handle export errors gracefully', async () => {
      const conversation = SAMPLE_CONVERSATIONS.simple;
      
      // Make output directory read-only
      await fs.chmod(testEnv.conversationsDir, 0o444);
      
      const result = await exportManager.export(conversation, 'markdown');
      
      expect(result.success).toBe(false);
      expect(result.path).toBeNull();
      
      // Restore permissions
      await fs.chmod(testEnv.conversationsDir, 0o755);
    });

    test('should support custom export options', async () => {
      const conversation = SAMPLE_CONVERSATIONS.withTools;
      
      const result = await exportManager.export(conversation, 'markdown', {
        detailed: true,
        includeTimestamps: true,
        includeMetadata: true
      });
      
      expect(result.success).toBe(true);
      const content = await fs.readFile(result.path, 'utf-8');
      expect(content).toContain('Tool Use');
      expect(content).toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(content).toContain('---'); // Metadata header
    });

    test('should validate export format', async () => {
      const conversation = SAMPLE_CONVERSATIONS.simple;
      
      await expect(
        exportManager.export(conversation, 'invalid-format')
      ).rejects.toThrow(/Unsupported format/);
    });

    test('should create output directory if not exists', async () => {
      const newOutputDir = path.join(testEnv.tempDir, 'new-export-dir');
      exportManager.outputDir = newOutputDir;
      
      await exportManager.export(SAMPLE_CONVERSATIONS.simple, 'markdown');
      
      const dirExists = await fs.exists(newOutputDir);
      expect(dirExists).toBe(true);
    });

    test('should generate unique filenames for conflicts', async () => {
      const conversation = SAMPLE_CONVERSATIONS.simple;
      
      // Export same conversation multiple times
      const result1 = await exportManager.export(conversation, 'markdown');
      const result2 = await exportManager.export(conversation, 'markdown');
      const result3 = await exportManager.export(conversation, 'markdown');
      
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result3.success).toBe(true);
      expect(result1.path).not.toBe(result2.path);
      expect(result2.path).not.toBe(result3.path);
      
      // All files should exist
      expect(await fs.exists(result1.path)).toBe(true);
      expect(await fs.exists(result2.path)).toBe(true);
      expect(await fs.exists(result3.path)).toBe(true);
    });

    test('should support export from search results', async () => {
      const searchResults = [
        {
          conversationId: 'conv-1',
          conversationName: 'Test 1',
          content: 'Match 1',
          conversation: SAMPLE_CONVERSATIONS.simple
        },
        {
          conversationId: 'conv-2',
          conversationName: 'Test 2',
          content: 'Match 2',
          conversation: SAMPLE_CONVERSATIONS.withTools
        }
      ];
      
      const results = await exportManager.exportSearchResults(searchResults, 'markdown');
      
      expect(results.exported).toBe(2);
      expect(results.paths).toHaveLength(2);
    });

    test('should support compressed export', async () => {
      const conversations = createMockConversationSet({ count: 3 });
      
      const zipPath = await exportManager.exportCompressed(conversations, 'markdown', {
        format: 'zip'
      });
      
      expect(zipPath.endsWith('.zip')).toBe(true);
      expect(await fs.exists(zipPath)).toBe(true);
    });
  });

  describe('Export Options', () => {
    test('should filter by date range', async () => {
      const exporter = new MarkdownExporter({
        outputDir: testEnv.conversationsDir
      });
      
      const conversations = createMockConversationSet({ count: 10 });
      const filtered = await exporter.filterByDateRange(conversations, {
        start: new Date('2024-01-15'),
        end: new Date('2024-01-20')
      });
      
      expect(filtered.length).toBeLessThanOrEqual(10);
    });

    test('should filter by minimum message count', async () => {
      const exporter = new MarkdownExporter({
        outputDir: testEnv.conversationsDir
      });
      
      const conversations = [
        SAMPLE_CONVERSATIONS.simple, // 2 messages
        SAMPLE_CONVERSATIONS.longConversation // 50 messages
      ];
      
      const filtered = await exporter.filterByMessageCount(conversations, {
        minMessages: 10
      });
      
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('conv-long-1');
    });

    test('should support custom templates', async () => {
      const exporter = new MarkdownExporter({
        outputDir: testEnv.conversationsDir,
        template: '{{name}}\n{{#messages}}{{role}}: {{content}}\n{{/messages}}'
      });
      
      const outputPath = path.join(testEnv.conversationsDir, 'custom.md');
      await exporter.export(SAMPLE_CONVERSATIONS.simple, outputPath);
      
      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toContain('Simple Chat');
      expect(content).toContain('human: What is JavaScript?');
    });
  });

  describe('Performance', () => {
    test('should handle large conversations efficiently', async () => {
      const largeConversation = {
        ...SAMPLE_CONVERSATIONS.simple,
        messages: Array.from({ length: 1000 }, (_, i) => ({
          role: i % 2 === 0 ? 'human' : 'assistant',
          content: `Message ${i} with some content`
        }))
      };
      
      const exporter = new MarkdownExporter({
        outputDir: testEnv.conversationsDir
      });
      
      const startTime = Date.now();
      await exporter.export(largeConversation);
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    });

    test('should stream large exports', async () => {
      const conversations = createMockConversationSet({ count: 100 });
      const manager = new ExportManager({
        outputDir: testEnv.conversationsDir
      });
      
      const startTime = Date.now();
      const results = await manager.exportBulk(conversations, 'json', {
        stream: true
      });
      const duration = Date.now() - startTime;
      
      expect(results.exported).toBe(100);
      expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
    });
  });
});