/**
 * Tests for keyword search operators in MiniSearchEngine
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { MiniSearchEngine } from '../../src/search/minisearch-engine.js';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Keyword Search Operators', () => {
  let engine;
  let testDir;

  beforeAll(async () => {
    // Create temp directory for test exports
    testDir = await mkdtemp(join(tmpdir(), 'keyword-ops-test-'));

    // Create test markdown files with known content
    const testConversations = [
      {
        file: 'proj1_abc123.md',
        content: `# Claude Code Conversation
**Project:** project-one
**Session ID:** abc123
**Date:** 2025-10-21T10:00:00Z

## User
Help me debug my TypeScript application. I'm getting type errors in my codebase and need to fix them. The TypeScript compiler is complaining about incompatible types in my function definitions. I need help understanding TypeScript type inference and how to properly type my functions.

## Claude
I'll help you with TypeScript debugging. TypeScript type errors can be tricky. Let's look at your type definitions and see where the TypeScript compiler is getting confused. We'll fix the type annotations and ensure proper TypeScript typing throughout your codebase.`
      },
      {
        file: 'proj2_def456.md',
        content: `# Claude Code Conversation
**Project:** project-two
**Session ID:** def456
**Date:** 2025-10-21T11:00:00Z

## User
How do I implement authentication with React? I need to build a user login system with React components and manage authentication state. Should I use React context or Redux for authentication? What are the best practices for React authentication?

## Claude
Let's implement React authentication using React hooks and context. We'll build a React authentication provider component that manages user sessions. React's built-in context API works great for authentication state management without needing Redux.`
      },
      {
        file: 'proj3_ghi789.md',
        content: `# Claude Code Conversation
**Project:** project-three
**Session ID:** ghi789
**Date:** 2025-10-21T12:00:00Z

## User
Build a REST API with Express and TypeScript. I want to create Express routes with proper TypeScript typing. Need to set up Express middleware, define TypeScript interfaces for request/response, and implement Express error handling with TypeScript.

## Claude
I'll help build an Express TypeScript API. We'll configure Express with TypeScript type definitions, create typed Express routes, and implement Express middleware with proper TypeScript interfaces. The Express framework works excellently with TypeScript.`
      }
    ];

    for (const conv of testConversations) {
      await writeFile(join(testDir, conv.file), conv.content, 'utf-8');
    }

    // Build index with keyword extraction
    engine = new MiniSearchEngine({ exportDir: testDir });
    await engine.buildIndex();
  });

  afterAll(async () => {
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });

  describe('keyword:term operator', () => {
    it('should filter conversations by single keyword', async () => {
      const results = await engine.search('keyword:typescript', { limit: 10 });

      expect(results.results.length).toBeGreaterThan(0);

      // All results should have typescript keyword
      for (const result of results.results) {
        const hasTypescript = result.keywords.some(k =>
          k.term.toLowerCase().includes('typescript')
        );
        expect(hasTypescript).toBe(true);
      }
    });

    it('should return empty array when keyword not found', async () => {
      const results = await engine.search('keyword:nonexistentkeyword123', { limit: 10 });

      expect(results.results).toEqual([]);
      expect(results.totalFound).toBe(0);
    });

    it('should support partial keyword matching', async () => {
      const results = await engine.search('keyword:type', { limit: 10 });

      // Should match "typescript" keyword
      expect(results.results.length).toBeGreaterThan(0);
    });
  });

  describe('keywords:term1,term2 operator (OR logic)', () => {
    it('should match conversations with ANY of the keywords', async () => {
      const results = await engine.search('keywords:typescript,react', { limit: 10 });

      expect(results.results.length).toBeGreaterThan(0);

      // Each result should have at least one of the keywords
      for (const result of results.results) {
        const hasAny = result.keywords.some(k => {
          const term = k.term.toLowerCase();
          return term.includes('typescript') || term.includes('react');
        });
        expect(hasAny).toBe(true);
      }
    });
  });

  describe('combined search with keyword filter', () => {
    it('should combine full-text search with keyword filter', async () => {
      const results = await engine.search('debugging keyword:typescript', { limit: 10 });

      expect(results.results.length).toBeGreaterThan(0);

      // Results should have typescript keyword AND contain "debugging" in content
      for (const result of results.results) {
        const hasTypescript = result.keywords.some(k =>
          k.term.toLowerCase().includes('typescript')
        );
        expect(hasTypescript).toBe(true);

        // Should match "debugging" in content
        const content = result.fullText || result.content || '';
        expect(content.toLowerCase()).toContain('debug');
      }
    });
  });

  describe('parseQuery() with keyword operators', () => {
    it('should parse keyword: operator correctly', () => {
      const parsed = engine.parseQuery('keyword:typescript');

      expect(parsed.searchQuery.trim()).toBe(''); // Query removed
      expect(parsed.searchOptions.filter).toBeDefined(); // Filter function added
    });

    it('should handle multiple keywords', () => {
      const parsed = engine.parseQuery('keywords:react,vue,angular');

      expect(parsed.searchQuery.trim()).toBe('');
      expect(parsed.searchOptions.filter).toBeDefined();
    });

    it('should preserve other search terms', () => {
      const parsed = engine.parseQuery('debugging keyword:typescript error');

      expect(parsed.searchQuery).toContain('debugging');
      expect(parsed.searchQuery).toContain('error');
      expect(parsed.searchQuery).not.toContain('keyword:');
    });
  });
});
