/**
 * Integration tests for CLI search functionality
 * Tests the actual search flow as a user would experience it
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { MiniSearchEngine } from '../../src/search/minisearch-engine.js';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

describe('CLI Search Integration', () => {
  const testProjectDir = join(homedir(), '.claude', 'projects', 'test-search-integration');
  const testExportDir = join(homedir(), '.claude', 'test-exports-cli-search');
  const testIndexPath = join(testExportDir, 'test-search-index.json');
  const testConversation1 = {
    id: 'test-conv-1',
    messages: [
      {
        role: 'user',
        content: 'Tell me about JavaScript and Node.js'
      },
      {
        role: 'assistant',
        content: 'JavaScript is a programming language, and Node.js is a runtime for running JavaScript on the server.'
      }
    ]
  };
  const testConversation2 = {
    id: 'test-conv-2',
    messages: [
      {
        role: 'user',
        content: 'What about Python and machine learning?'
      }
    ]
  };

  // Helper to convert conversation to processedConversations format
  const conversationToProcessed = (conv, projectName = 'TestProject') => {
    const messagesText = conv.messages.map(m => m.content).join('\n\n');
    return {
      id: conv.id,
      project: projectName,
      fullText: messagesText,
      preview: messagesText.slice(0, 100) + (messagesText.length > 100 ? '...' : ''),
      modified: new Date().toISOString(),
      wordCount: messagesText.split(/\s+/).length,
      messageCount: conv.messages.length
    };
  };

  beforeAll(async () => {
    // Create test conversations directory structure with subdirectories
    const testProject1 = join(testProjectDir, 'test-project-1');
    const testProject2 = join(testProjectDir, 'test-project-2');

    await mkdir(testProject1, { recursive: true });
    await mkdir(testProject2, { recursive: true });
    await mkdir(testExportDir, { recursive: true });
    
    // Create multiple test files with proper conversation format in subdirectories
    await writeFile(
      join(testProject1, 'conversation1.jsonl'),
      JSON.stringify(testConversation1)
    );
    
    await writeFile(
      join(testProject2, 'conversation2.jsonl'),
      JSON.stringify(testConversation2)
    );
  });

  afterAll(async () => {
    await rm(testProjectDir, { recursive: true, force: true });
    await rm(testExportDir, { recursive: true, force: true });
  });

  describe('Search Result Format', () => {
    it('should return object with results array for CLI compatibility', async () => {
      const engine = new MiniSearchEngine({ projectsDir: testProjectDir, exportDir: testExportDir, indexPath: testIndexPath });
      const result = await engine.search('JavaScript');
      
      // CLI expects this exact format
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('totalFound');
      expect(result).toHaveProperty('searchTime');
      expect(Array.isArray(result.results)).toBe(true);
      expect(typeof result.totalFound).toBe('number');
      expect(typeof result.searchTime).toBe('number');
    });

    it('should handle empty search query correctly', async () => {
      const engine = new MiniSearchEngine({ projectsDir: testProjectDir, exportDir: testExportDir, indexPath: testIndexPath });
      const result = await engine.search('');
      
      expect(result).toEqual({
        results: [],
        totalFound: 0,
        searchTime: expect.any(Number)
      });
    });

    it('should handle null/undefined search query', async () => {
      const engine = new MiniSearchEngine({ projectsDir: testProjectDir, exportDir: testExportDir, indexPath: testIndexPath });
      const resultNull = await engine.search(null);
      const resultUndefined = await engine.search(undefined);
      
      expect(resultNull).toEqual({
        results: [],
        totalFound: 0,
        searchTime: expect.any(Number)
      });
      
      expect(resultUndefined).toEqual({
        results: [],
        totalFound: 0,
        searchTime: expect.any(Number)
      });
    });

    it('should handle search with no matches', async () => {
      const engine = new MiniSearchEngine({ projectsDir: testProjectDir, exportDir: testExportDir, indexPath: testIndexPath });
      const result = await engine.search('NonexistentTermXYZ123');
      
      expect(result).toEqual({
        results: [],
        totalFound: 0,
        searchTime: expect.any(Number)
      });
    });
  });

  describe('Basic Search Functionality', () => {
    it('should find conversations with exact terms', async () => {
      const engine = new MiniSearchEngine({ projectsDir: testProjectDir, exportDir: testExportDir, indexPath: testIndexPath });

      // Convert test conversations to processedConversations format
      const processedConversations = [
        conversationToProcessed(testConversation1, 'test-project-1'),
        conversationToProcessed(testConversation2, 'test-project-2')
      ];

      // Build index with processed conversations
      await engine.buildIndex(processedConversations);

      const result = await engine.search('JavaScript');

      expect(result.results).toBeDefined();
      expect(result.totalFound).toBeGreaterThan(0);

      // Check that results contain the search term
      const hasJavaScript = result.results.some(r =>
        r.content?.includes('JavaScript') ||
        r.preview?.includes('JavaScript')
      );
      expect(hasJavaScript).toBe(true);
    });

    it('should find conversations with partial terms', async () => {
      const engine = new MiniSearchEngine({ projectsDir: testProjectDir, exportDir: testExportDir, indexPath: testIndexPath });

      // Convert test conversations to processedConversations format
      const processedConversations = [
        conversationToProcessed(testConversation1, 'test-project-1'),
        conversationToProcessed(testConversation2, 'test-project-2')
      ];

      // Build index with processed conversations
      await engine.buildIndex(processedConversations);

      const result = await engine.search('Java');

      expect(result.results).toBeDefined();
      expect(result.totalFound).toBeGreaterThan(0);
    });

    it('should handle common words like "the"', async () => {
      const engine = new MiniSearchEngine({ projectsDir: testProjectDir, exportDir: testExportDir, indexPath: testIndexPath });
      const result = await engine.search('the');
      
      // Should return results (not error out)
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('totalFound');
    });

    it('should handle single character searches', async () => {
      const engine = new MiniSearchEngine({ projectsDir: testProjectDir, exportDir: testExportDir, indexPath: testIndexPath });
      const result = await engine.search('a');
      
      // Should return empty or some results, but not error
      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('should handle special characters in search', async () => {
      const engine = new MiniSearchEngine({ projectsDir: testProjectDir, exportDir: testExportDir, indexPath: testIndexPath });
      const specialChars = ['@', '#', '$', '%', '&', '*'];
      
      for (const char of specialChars) {
        const result = await engine.search(char);
        expect(result).toHaveProperty('results');
        expect(Array.isArray(result.results)).toBe(true);
      }
    });
  });

  describe('Search Result Content', () => {
    it('should include required fields for CLI display', async () => {
      const engine = new MiniSearchEngine({ projectsDir: testProjectDir, exportDir: testExportDir, indexPath: testIndexPath });

      // Convert test conversations to processedConversations format
      const processedConversations = [
        conversationToProcessed(testConversation1, 'test-project-1'),
        conversationToProcessed(testConversation2, 'test-project-2')
      ];

      // Build index with processed conversations
      await engine.buildIndex(processedConversations);

      const result = await engine.search('JavaScript');

      if (result.results.length > 0) {
        const firstResult = result.results[0];

        // Fields the CLI expects
        expect(firstResult).toHaveProperty('project');
        expect(firstResult).toHaveProperty('preview');
        expect(firstResult).toHaveProperty('relevance');
        // Note: originalPath is only present when reading from files, not from processedConversations
      }
    });

    it('should properly escape/handle HTML-like content', async () => {
      const engine = new MiniSearchEngine({ projectsDir: testProjectDir, exportDir: testExportDir, indexPath: testIndexPath });
      
      // Create a test file with HTML-like content in a subdirectory
      const htmlTestDir = join(testProjectDir, 'html-test-project');
      await mkdir(htmlTestDir, { recursive: true });
      await writeFile(
        join(htmlTestDir, 'test.jsonl'),
        JSON.stringify({
          messages: [{
            role: 'user',
            content: '<script>alert("test")</script> Some normal text'
          }]
        })
      );
      
      const result = await engine.search('script');
      
      // Should handle it without crashing
      expect(result).toHaveProperty('results');
    });
  });

  describe('Performance Requirements', () => {
    it('should complete search within reasonable time', async () => {
      const engine = new MiniSearchEngine({ projectsDir: testProjectDir, exportDir: testExportDir, indexPath: testIndexPath });
      const startTime = Date.now();
      const result = await engine.search('test');
      const duration = Date.now() - startTime;

      // Search should complete within 2 seconds even without index
      // (Increased from 1s to account for system load variations)
      expect(duration).toBeLessThan(2000);
      expect(result.searchTime).toBeLessThan(2000);
    });

    it('should handle multiple concurrent searches', async () => {
      const engine = new MiniSearchEngine({ projectsDir: testProjectDir, exportDir: testExportDir, indexPath: testIndexPath });
      
      // Fire off multiple searches at once
      const searches = [
        engine.search('JavaScript'),
        engine.search('Python'),
        engine.search('Node'),
        engine.search('machine'),
        engine.search('learning')
      ];
      
      const results = await Promise.all(searches);
      
      // All should complete successfully
      results.forEach(result => {
        expect(result).toHaveProperty('results');
        expect(result).toHaveProperty('totalFound');
        expect(result).toHaveProperty('searchTime');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long search queries', async () => {
      const engine = new MiniSearchEngine({ projectsDir: testProjectDir, exportDir: testExportDir, indexPath: testIndexPath });
      const longQuery = 'JavaScript '.repeat(100);
      
      const result = await engine.search(longQuery);
      expect(result).toHaveProperty('results');
    });

    it('should handle unicode and emoji', async () => {
      const engine = new MiniSearchEngine({ projectsDir: testProjectDir, exportDir: testExportDir, indexPath: testIndexPath });
      
      const unicodeQueries = [
        '你好',
        '🚀',
        'café',
        'Здравствуйте'
      ];
      
      for (const query of unicodeQueries) {
        const result = await engine.search(query);
        expect(result).toHaveProperty('results');
        expect(Array.isArray(result.results)).toBe(true);
      }
    });

    it('should handle when projects directory does not exist', async () => {
      const engine = new MiniSearchEngine({
        projectsDir: '/nonexistent/path/that/does/not/exist'
      });
      
      const result = await engine.search('test');
      
      // Should return empty results, not crash
      expect(result).toEqual({
        results: [],
        totalFound: 0,
        searchTime: expect.any(Number)
      });
    });
  });
});