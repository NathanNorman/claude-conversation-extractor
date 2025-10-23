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

    // Create test JSONL files with known content
    const testConversations = [
      {
        file: 'proj1_abc123.jsonl',
        content: `{"type":"summary","summary":"TypeScript Debugging Session","leafUuid":"abc123"}
{"type":"user","message":{"role":"user","content":"I'm having severe TypeScript compilation issues in my large TypeScript codebase. The TypeScript compiler keeps throwing type errors that I don't understand. My TypeScript interfaces seem correct but the TypeScript type checker disagrees. I've been working with TypeScript for years but this TypeScript project has complex type definitions that are causing TypeScript to fail compilation. The TypeScript error messages mention type incompatibility but I can't figure out where my TypeScript types are wrong. Can you help me debug these TypeScript type errors? I need to understand TypeScript's type inference better. My TypeScript configuration might be wrong. The TypeScript compiler is very strict and I'm getting TypeScript errors in functions that I think are correctly typed. TypeScript generics are particularly confusing in this TypeScript codebase. I need TypeScript debugging help urgently because my TypeScript build is completely broken. We have multiple TypeScript modules and each TypeScript file has different TypeScript type issues. Our TypeScript strict mode is causing problems but we need TypeScript strict mode for safety. How can I fix these TypeScript errors? The TypeScript compiler output is very verbose and I'm struggling to find the real TypeScript problems. I need someone experienced in TypeScript to help me understand what's happening. TypeScript type checking is essential but the TypeScript errors are overwhelming. My team relies on TypeScript for code quality but TypeScript is preventing our TypeScript builds from succeeding."},"timestamp":"2025-10-21T10:00:00.000Z","sessionId":"abc123","uuid":"msg-user-1","projectPath":"/typescript-debugging-project"}
{"type":"assistant","message":{"role":"assistant","content":"I'll help you debug your TypeScript issues. TypeScript type errors can definitely be tricky to diagnose, especially in large TypeScript codebases with complex TypeScript type hierarchies. Let's start by examining your TypeScript configuration file (tsconfig.json). TypeScript's strict mode can cause many TypeScript errors that seem mysterious at first. I'll walk you through common TypeScript debugging techniques. First, let's look at your TypeScript interfaces and see if there are any TypeScript type mismatches. TypeScript's type inference is powerful but sometimes TypeScript needs explicit type annotations. We'll fix your TypeScript errors one by one. TypeScript compilation errors often cascade, so fixing one TypeScript type can resolve multiple TypeScript errors. Let me see your TypeScript function signatures and TypeScript interface definitions. We'll make sure your TypeScript types are consistent throughout the TypeScript codebase. TypeScript debugging requires understanding how the TypeScript compiler infers types and where TypeScript's type system gets confused. The key to solving TypeScript problems is understanding TypeScript's error messages. We should enable TypeScript source maps for better TypeScript debugging. TypeScript is a powerful language but TypeScript can be frustrating when TypeScript errors aren't clear. I recommend we start with the most critical TypeScript errors first. Once we fix one TypeScript error, other TypeScript issues may become clearer. TypeScript has excellent tooling that can help us understand TypeScript type relationships better."},"timestamp":"2025-10-21T10:00:01.000Z","sessionId":"abc123","uuid":"msg-asst-1"}`
      },
      {
        file: 'proj2_def456.jsonl',
        content: `{"type":"summary","summary":"React Authentication Implementation","leafUuid":"def456"}
{"type":"user","message":{"role":"user","content":"I need to implement authentication in my React application. This React app needs a complete React authentication system with user login. I'm using React hooks and React context but I'm not sure how to structure React authentication properly. Should I use React's built-in context API for React authentication or do I need Redux? My React components need to access authentication state. I want to build React authentication that's secure and follows React best practices. The React authentication flow should handle login, logout, and protected routes. I need React authentication guards that prevent unauthorized access to React components. Can you show me how to implement React authentication from scratch? My React application is a large React codebase with many React components that need authentication. React hooks would be great for managing React authentication state. I want to use React context providers for the React authentication system. How do React authentication tokens work? Should React authentication use localStorage or sessionStorage? I need comprehensive React authentication that works well with modern React patterns. We have dozens of React pages and React components that require React authentication checks. The React authentication implementation needs to be performant and not cause unnecessary React re-renders. I want the React authentication system to integrate seamlessly with our React application architecture. React component lifecycle needs to respect React authentication state changes. Can you help me design the best React authentication solution for our React project?"},"timestamp":"2025-10-21T11:00:00.000Z","sessionId":"def456","uuid":"msg-user-2","projectPath":"/react-authentication-app"}
{"type":"assistant","message":{"role":"assistant","content":"I'll help you implement authentication in your React application. React authentication using React hooks and React context is a great approach that doesn't require Redux for most React apps. Let's build a React authentication system using React's Context API. We'll create a React AuthContext that provides React authentication state to all your React components. First, I'll show you how to create a React authentication provider component using React hooks. The React authentication provider will manage user sessions and authentication tokens. Your React components can then consume the React authentication context using the useContext React hook. For React authentication, we'll implement login functionality, logout capabilities, and protected React routes. React authentication should check if users are authenticated before rendering protected React components. We'll use React custom hooks for authentication logic. The React authentication system will handle JWT tokens and store them securely. React best practices suggest using React context for cross-cutting concerns like React authentication. Your React app will have a clean React authentication flow that integrates seamlessly with your existing React component architecture. We can create a useAuth React hook for convenient React authentication access. Protected React routes can use React authentication status to conditionally render content. The React authentication design will prevent React security issues like token leaks. Our React authentication approach allows React components to be authentication-aware without tight coupling. This React authentication solution will scale well as your React application grows."},"timestamp":"2025-10-21T11:00:01.000Z","sessionId":"def456","uuid":"msg-asst-2"}`
      },
      {
        file: 'proj3_ghi789.jsonl',
        content: `{"type":"summary","summary":"Express API Backend Development","leafUuid":"ghi789"}
{"type":"user","message":{"role":"user","content":"I'm building a REST API using Express and Node.js. This Express API needs proper error handling, Express middleware, and Express routing. I want to structure my Express application following Express best practices. The Express server should handle HTTP requests efficiently. I need Express route handlers for CRUD operations. My Express API uses Express Router to organize Express routes. Should I use Express middleware for authentication in my Express app? I want to add Express error handling middleware that catches all Express errors. The Express application needs input validation using Express validator middleware. How do I structure large Express applications? My Express API needs proper Express logging middleware. I want to implement Express rate limiting to protect the Express API endpoints. Can you help me build a production-ready Express REST API? The Express server should handle concurrent Express requests. I need Express middleware for CORS, Express body parsing, and Express security headers. My Express routes need proper Express response formatting. How does Express error handling work with async Express route handlers? I want comprehensive Express middleware for my Express application. Our Express API serves thousands of requests daily so Express performance is critical. Express caching strategies could improve Express API response times. We need Express authentication middleware to protect sensitive Express endpoints. The Express framework flexibility allows us to customize Express behavior extensively. I want to use Express validation middleware to ensure data quality in our Express API."},"timestamp":"2025-10-21T12:00:00.000Z","sessionId":"ghi789","uuid":"msg-user-3","projectPath":"/express-api-backend"}
{"type":"assistant","message":{"role":"assistant","content":"I'll help you build a robust Express REST API. Express is excellent for building Node.js APIs and Express's middleware system is very powerful. Let's start by setting up your Express application structure using Express best practices. We'll organize your Express routes using Express Router for modularity. Express middleware is key to building maintainable Express applications. I'll show you how to create custom Express middleware for authentication and authorization in your Express API. For Express error handling, we'll implement centralized Express error middleware that catches all Express errors across your Express routes. Express async error handling requires special attention - we'll use Express async handler wrappers. Your Express application needs Express body parser middleware to handle Express request bodies. We'll add Express CORS middleware for cross-origin Express requests. Express logging middleware will help debug your Express API. I'll demonstrate Express input validation using Express validator. Your Express routes will be organized into separate Express router modules. Express security middleware like Helmet will protect your Express API from common vulnerabilities. We'll implement Express rate limiting to prevent Express API abuse. The Express server will be production-ready with proper Express configuration and Express error handling throughout. Our Express architecture will support Express scalability as your Express API grows. We can use Express middleware composition for clean Express code organization."},"timestamp":"2025-10-21T12:00:01.000Z","sessionId":"ghi789","uuid":"msg-asst-3"}`
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
