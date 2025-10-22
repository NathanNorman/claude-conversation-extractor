/**
 * Tests for Keyword Analyzer
 */

import { analyzeKeywords, analyzeProjectKeywords } from '../../src/analytics/analyzers/keyword-analyzer.js';

/**
 * Helper function to create test conversations
 * @param {Array<string|Object>} keywords - Keywords (can be strings or objects with term/score)
 * @param {string} project - Project name
 * @param {string} modified - ISO date string
 * @returns {Object} Test conversation
 */
function createTestConversation(keywords, project = 'default-project', modified = '2025-10-21T10:00:00Z') {
  return {
    id: Math.random().toString(36).substr(2, 9),
    keywords,
    project,
    modified
  };
}

describe('Keyword Analyzer', () => {
  describe('analyzeKeywords()', () => {
    test('should handle empty conversation array', () => {
      const result = analyzeKeywords([]);

      expect(result.summary.totalConversations).toBe(0);
      expect(result.summary.conversationsWithKeywords).toBe(0);
      expect(result.summary.uniqueKeywords).toBe(0);
      expect(result.summary.coveragePercentage).toBe(0);
      expect(result.topKeywords).toEqual([]);
      expect(result.topKeywordsByProject).toEqual({});
      expect(result.topKeywordPairs).toEqual([]);
      expect(result.rareKeywords).toEqual([]);
    });

    test('should analyze keywords across multiple conversations', () => {
      const conversations = [
        createTestConversation(['typescript', 'debugging', 'api'], 'proj1'),
        createTestConversation(['typescript', 'react', 'performance'], 'proj1'),
        createTestConversation(['nodejs', 'database', 'optimization'], 'proj2')
      ];

      const result = analyzeKeywords(conversations);

      expect(result.summary.totalConversations).toBe(3);
      expect(result.summary.conversationsWithKeywords).toBe(3);
      expect(result.summary.uniqueKeywords).toBe(8);
      expect(result.summary.coveragePercentage).toBe(100);
      expect(result.topKeywords.length).toBeGreaterThan(0);
      expect(result.topKeywords[0]).toHaveProperty('term');
      expect(result.topKeywords[0]).toHaveProperty('count');
      expect(result.topKeywords[0]).toHaveProperty('percentage');
    });

    test('should count keyword frequency correctly', () => {
      const conversations = [
        createTestConversation(['typescript'], 'proj1', '2025-10-21T10:00:00Z'),
        createTestConversation(['typescript', 'api'], 'proj1', '2025-10-22T10:00:00Z'),
        createTestConversation(['react'], 'proj2', '2025-10-23T10:00:00Z')
      ];

      const result = analyzeKeywords(conversations);

      const typescriptKeyword = result.topKeywords.find(k => k.term === 'typescript');
      const apiKeyword = result.topKeywords.find(k => k.term === 'api');
      const reactKeyword = result.topKeywords.find(k => k.term === 'react');

      expect(typescriptKeyword.count).toBe(2);
      expect(apiKeyword.count).toBe(1);
      expect(reactKeyword.count).toBe(1);
    });

    test('should handle conversations without keywords', () => {
      const conversations = [
        createTestConversation(['typescript', 'debugging'], 'proj1'),
        createTestConversation([], 'proj1'), // No keywords
        createTestConversation(['react'], 'proj2'),
        { id: 'conv-no-kw', project: 'proj2', modified: '2025-10-21T10:00:00Z' } // No keywords property
      ];

      const result = analyzeKeywords(conversations);

      expect(result.summary.totalConversations).toBe(4);
      expect(result.summary.conversationsWithKeywords).toBe(2);
      expect(result.summary.coveragePercentage).toBe(50);
      expect(result.summary.uniqueKeywords).toBe(3); // typescript, debugging, react
    });

    test('should handle both string and object keyword formats', () => {
      const conversations = [
        {
          id: 'conv1',
          keywords: ['typescript', 'debugging'], // String format
          project: 'proj1',
          modified: '2025-10-21T10:00:00Z'
        },
        {
          id: 'conv2',
          keywords: [ // Object format
            { term: 'react', score: 0.95 },
            { term: 'performance', score: 0.87 }
          ],
          project: 'proj1',
          modified: '2025-10-22T10:00:00Z'
        }
      ];

      const result = analyzeKeywords(conversations);

      expect(result.summary.uniqueKeywords).toBe(4);
      const keywords = result.topKeywords.map(k => k.term);
      expect(keywords).toContain('typescript');
      expect(keywords).toContain('react');
      expect(keywords).toContain('debugging');
      expect(keywords).toContain('performance');
    });

    test('should group keywords by project', () => {
      const conversations = [
        createTestConversation(['typescript', 'api'], 'project-a', '2025-10-21T10:00:00Z'),
        createTestConversation(['typescript', 'database'], 'project-a', '2025-10-22T10:00:00Z'),
        createTestConversation(['python', 'ml'], 'project-b', '2025-10-21T10:00:00Z'),
        createTestConversation(['python', 'data'], 'project-b', '2025-10-22T10:00:00Z')
      ];

      const result = analyzeKeywords(conversations);

      expect(result.topKeywordsByProject).toHaveProperty('project-a');
      expect(result.topKeywordsByProject).toHaveProperty('project-b');

      // Project A should have typescript
      const projectAKeywords = result.topKeywordsByProject['project-a'].map(k => k.term);
      expect(projectAKeywords).toContain('typescript');

      // Project B should have python
      const projectBKeywords = result.topKeywordsByProject['project-b'].map(k => k.term);
      expect(projectBKeywords).toContain('python');
    });

    test('should limit topKeywordsByProject to 5 keywords per project', () => {
      const conversations = [
        createTestConversation(
          ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7'],
          'project-x',
          '2025-10-21T10:00:00Z'
        )
      ];

      const result = analyzeKeywords(conversations);

      expect(result.topKeywordsByProject['project-x'].length).toBe(5);
    });

    test('should detect keyword co-occurrence patterns', () => {
      const conversations = [
        createTestConversation(['typescript', 'api', 'nodejs'], 'proj1', '2025-10-21T10:00:00Z'),
        createTestConversation(['typescript', 'api'], 'proj1', '2025-10-22T10:00:00Z'),
        createTestConversation(['python', 'ml'], 'proj2', '2025-10-21T10:00:00Z')
      ];

      const result = analyzeKeywords(conversations);

      expect(result.topKeywordPairs.length).toBeGreaterThan(0);

      // Should have typescript + api pair (appears 2 times)
      const typeScriptApiPair = result.topKeywordPairs.find(p =>
        p.keywords.includes('typescript') && p.keywords.includes('api')
      );
      expect(typeScriptApiPair).toBeDefined();
      expect(typeScriptApiPair.count).toBe(2);
    });

    test('should limit topKeywordPairs to 10 pairs', () => {
      const keywords = Array.from({ length: 15 }, (_, i) => `key${i}`);
      const conversations = [
        createTestConversation(keywords, 'proj1')
      ];

      const result = analyzeKeywords(conversations);

      // With 15 keywords, we can have C(15,2) = 105 pairs
      // but topKeywordPairs should be limited to 10
      expect(result.topKeywordPairs.length).toBeLessThanOrEqual(10);
    });

    test('should not create co-occurrence pairs for single keywords', () => {
      const conversations = [
        createTestConversation(['typescript'], 'proj1'),
        createTestConversation(['react'], 'proj1'),
        createTestConversation(['python'], 'proj2')
      ];

      const result = analyzeKeywords(conversations);

      // No keywords appear together, so no co-occurrence
      expect(result.topKeywordPairs).toEqual([]);
    });

    test('should calculate keyword trends across two months', () => {
      const conversations = [
        createTestConversation(['typescript', 'api'], 'proj1', '2025-09-15T10:00:00Z'),
        createTestConversation(['typescript'], 'proj1', '2025-09-20T10:00:00Z'),
        createTestConversation(['typescript', 'react', 'api'], 'proj1', '2025-10-10T10:00:00Z'),
        createTestConversation(['typescript', 'api', 'database'], 'proj1', '2025-10-20T10:00:00Z')
      ];

      const result = analyzeKeywords(conversations);

      expect(result.trends.length).toBeGreaterThan(0);

      // Trends should have direction field
      for (const trend of result.trends) {
        expect(['up', 'down', 'stable', 'new']).toContain(trend.direction);
        expect(trend).toHaveProperty('keyword');
        expect(trend).toHaveProperty('lastMonth');
        expect(trend).toHaveProperty('previousMonth');
        expect(trend).toHaveProperty('changePercent');
      }
    });

    test('should return empty trends with insufficient months of data', () => {
      const conversations = [
        createTestConversation(['typescript', 'api'], 'proj1', '2025-10-21T10:00:00Z')
      ];

      const result = analyzeKeywords(conversations);

      expect(result.trends).toEqual([]);
    });

    test('should identify rare keywords (appearing 1-2 times)', () => {
      const conversations = [
        createTestConversation(['common', 'common', 'rare1'], 'proj1'),
        createTestConversation(['common', 'rare2'], 'proj1'),
        createTestConversation(['rare3'], 'proj1'),
        createTestConversation(['common', 'common'], 'proj2')
      ];

      const result = analyzeKeywords(conversations);

      // rare1, rare2, rare3 should all appear in rareKeywords
      const rareTerms = result.rareKeywords.map(k => k.term);
      expect(rareTerms).toContain('rare1');
      expect(rareTerms).toContain('rare2');
      expect(rareTerms).toContain('rare3');

      // common should not be in rare keywords (appears > 2 times)
      expect(rareTerms).not.toContain('common');

      // All rare keywords should have count <= 2
      for (const rare of result.rareKeywords) {
        expect(rare.count).toBeLessThanOrEqual(2);
      }
    });

    test('should limit rareKeywords to 20 items', () => {
      const keywords = Array.from({ length: 50 }, (_, i) => `unique${i}`);
      const conversations = keywords.map(k => createTestConversation([k], 'proj1'));

      const result = analyzeKeywords(conversations);

      expect(result.rareKeywords.length).toBeLessThanOrEqual(20);
    });

    test('should handle conversations without dates gracefully', () => {
      const conversations = [
        createTestConversation(['typescript'], 'proj1'),
        {
          id: 'conv-no-date',
          keywords: ['react'],
          project: 'proj1'
          // No modified date
        },
        createTestConversation(['python'], 'proj2')
      ];

      const result = analyzeKeywords(conversations);

      expect(result.summary.conversationsWithKeywords).toBe(3);
      expect(result.summary.uniqueKeywords).toBe(3);
      // Should not crash and trends will be empty or minimal
    });

    test('should normalize keywords to lowercase', () => {
      const conversations = [
        createTestConversation(['TypeScript', 'REACT', 'Python'], 'proj1')
      ];

      const result = analyzeKeywords(conversations);

      const keywords = result.topKeywords.map(k => k.term);
      expect(keywords).toContain('typescript');
      expect(keywords).toContain('react');
      expect(keywords).toContain('python');
    });

    test('should calculate correct percentage for each keyword', () => {
      // Keywords are tracked by occurrence, not conversation
      // So with 4 occurrences total: 3 for typescript = 75%, 1 for react = 25%
      const conversations = [
        createTestConversation(['typescript'], 'proj1'),
        createTestConversation(['typescript'], 'proj1'),
        createTestConversation(['typescript'], 'proj1'),
        createTestConversation(['react'], 'proj1')
      ];

      const result = analyzeKeywords(conversations);

      const typescriptKeyword = result.topKeywords.find(k => k.term === 'typescript');
      const reactKeyword = result.topKeywords.find(k => k.term === 'react');

      // typescript appears 3 times out of 4 total = 75%
      expect(typescriptKeyword.percentage).toBe(75);

      // react appears 1 time out of 4 total = 25%
      expect(reactKeyword.percentage).toBe(25);
    });

    test('should return all required result sections', () => {
      const conversations = [
        createTestConversation(['typescript', 'api'], 'proj1')
      ];

      const result = analyzeKeywords(conversations);

      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('topKeywords');
      expect(result).toHaveProperty('topKeywordsByProject');
      expect(result).toHaveProperty('topKeywordPairs');
      expect(result).toHaveProperty('trends');
      expect(result).toHaveProperty('rareKeywords');
    });

    test('should limit topKeywords to 30 items', () => {
      const keywords = Array.from({ length: 50 }, (_, i) => `key${i}`);
      const conversations = [
        createTestConversation(keywords, 'proj1')
      ];

      const result = analyzeKeywords(conversations);

      expect(result.topKeywords.length).toBeLessThanOrEqual(30);
    });

    test('should sort topKeywords by frequency (descending)', () => {
      const conversations = [
        createTestConversation(['a', 'b', 'c'], 'proj1'),
        createTestConversation(['a', 'b'], 'proj1'),
        createTestConversation(['a'], 'proj1')
      ];

      const result = analyzeKeywords(conversations);

      const counts = result.topKeywords.map(k => k.count);
      // Check that counts are in descending order
      for (let i = 0; i < counts.length - 1; i++) {
        expect(counts[i]).toBeGreaterThanOrEqual(counts[i + 1]);
      }
    });

    test('should handle mixed keyword formats in same conversation', () => {
      const conversations = [
        {
          id: 'mixed',
          keywords: [
            'typescript',
            { term: 'react', score: 0.9 },
            'api',
            { term: 'debugging', score: 0.85 }
          ],
          project: 'proj1',
          modified: '2025-10-21T10:00:00Z'
        }
      ];

      const result = analyzeKeywords(conversations);

      expect(result.summary.uniqueKeywords).toBe(4);
      const terms = result.topKeywords.map(k => k.term);
      expect(terms).toContain('typescript');
      expect(terms).toContain('react');
      expect(terms).toContain('api');
      expect(terms).toContain('debugging');
    });

    test('should handle timeline with multiple months', () => {
      const conversations = [
        createTestConversation(['typescript'], 'proj1', '2025-08-15T10:00:00Z'),
        createTestConversation(['typescript'], 'proj1', '2025-09-15T10:00:00Z'),
        createTestConversation(['typescript'], 'proj1', '2025-10-15T10:00:00Z')
      ];

      const result = analyzeKeywords(conversations);

      // Timeline exists but is internal to the module
      expect(result.trends).toBeDefined();
    });

    test('should handle null or invalid keyword values', () => {
      const conversations = [
        {
          id: 'conv1',
          keywords: ['typescript', null, '', { term: 'react', score: 0.9 }, undefined],
          project: 'proj1'
        }
      ];

      const result = analyzeKeywords(conversations);

      expect(result.summary.uniqueKeywords).toBe(2); // typescript and react
      const terms = result.topKeywords.map(k => k.term);
      expect(terms).toContain('typescript');
      expect(terms).toContain('react');
    });

    test('should calculate coverage percentage correctly', () => {
      const conversations = [
        createTestConversation(['typescript'], 'proj1'),
        createTestConversation(['react'], 'proj1'),
        { id: 'no-kw', project: 'proj1' }, // No keywords
        { id: 'no-kw2', project: 'proj1' }  // No keywords
      ];

      const result = analyzeKeywords(conversations);

      expect(result.summary.totalConversations).toBe(4);
      expect(result.summary.conversationsWithKeywords).toBe(2);
      expect(result.summary.coveragePercentage).toBe(50);
    });

    test('should sort rareKeywords alphabetically', () => {
      const conversations = [
        createTestConversation(['zebra', 'apple', 'banana'], 'proj1'),
        createTestConversation(['monkey'], 'proj1')
      ];

      const result = analyzeKeywords(conversations);

      // All of these are rare (appear 1-2 times)
      const rareTerms = result.rareKeywords.map(k => k.term);

      // Verify it's sorted (first should come before second in alphabetical order)
      for (let i = 0; i < rareTerms.length - 1; i++) {
        expect(rareTerms[i].localeCompare(rareTerms[i + 1])).toBeLessThanOrEqual(0);
      }
    });

    test('should include percentage in project keywords', () => {
      const conversations = [
        createTestConversation(['typescript', 'api'], 'proj1'),
        createTestConversation(['typescript'], 'proj1')
      ];

      const result = analyzeKeywords(conversations);

      const projKeywords = result.topKeywordsByProject['proj1'];
      for (const kw of projKeywords) {
        expect(kw).toHaveProperty('term');
        expect(kw).toHaveProperty('count');
        expect(kw).toHaveProperty('percentage');
        expect(typeof kw.percentage).toBe('number');
      }
    });
  });

  describe('analyzeProjectKeywords()', () => {
    test('should analyze keywords for specific project', () => {
      const conversations = [
        createTestConversation(['typescript', 'api', 'debugging'], 'my-project'),
        createTestConversation(['typescript', 'react'], 'my-project'),
        createTestConversation(['nodejs', 'database'], 'my-project'),
        createTestConversation(['python', 'ml'], 'other-project') // Different project
      ];

      const result = analyzeProjectKeywords(conversations, 'my-project');

      expect(result.project).toBe('my-project');
      expect(result.totalConversations).toBe(3);
      expect(result.conversationsWithKeywords).toBe(3);
      expect(result.keywords.length).toBeGreaterThan(0);
      expect(result.keywords[0]).toHaveProperty('term');
      expect(result.keywords[0]).toHaveProperty('count');
      expect(result.keywords[0]).toHaveProperty('percentage');
    });

    test('should return empty keywords when project has no keywords', () => {
      const conversations = [
        { id: 'conv1', project: 'empty-project' },
        { id: 'conv2', project: 'empty-project' },
        { id: 'conv3', keywords: [] }
      ];

      const result = analyzeProjectKeywords(conversations, 'empty-project');

      expect(result.project).toBe('empty-project');
      expect(result.totalConversations).toBe(2);
      expect(result.conversationsWithKeywords).toBe(0);
      expect(result.keywords).toEqual([]);
    });

    test('should limit keywords to 10 items per project', () => {
      const keywords = Array.from({ length: 20 }, (_, i) => `key${i}`);
      const conversations = [
        createTestConversation(keywords, 'my-project')
      ];

      const result = analyzeProjectKeywords(conversations, 'my-project');

      expect(result.keywords.length).toBeLessThanOrEqual(10);
    });

    test('should count keyword frequencies correctly in project', () => {
      const conversations = [
        createTestConversation(['typescript', 'api'], 'my-project'),
        createTestConversation(['typescript'], 'my-project'),
        createTestConversation(['api'], 'my-project')
      ];

      const result = analyzeProjectKeywords(conversations, 'my-project');

      const typescriptKeyword = result.keywords.find(k => k.term === 'typescript');
      const apiKeyword = result.keywords.find(k => k.term === 'api');

      expect(typescriptKeyword.count).toBe(2);
      expect(apiKeyword.count).toBe(2);
    });

    test('should handle mixed string and object keyword formats in project', () => {
      const conversations = [
        {
          id: 'conv1',
          keywords: ['typescript', { term: 'api', score: 0.9 }],
          project: 'my-project'
        },
        createTestConversation(['react'], 'my-project')
      ];

      const result = analyzeProjectKeywords(conversations, 'my-project');

      expect(result.totalConversations).toBe(2);
      expect(result.conversationsWithKeywords).toBe(2);
      const terms = result.keywords.map(k => k.term);
      expect(terms).toContain('typescript');
      expect(terms).toContain('api');
      expect(terms).toContain('react');
    });

    test('should sort keywords by frequency (descending)', () => {
      const conversations = [
        createTestConversation(['a', 'b', 'c'], 'my-project'),
        createTestConversation(['a', 'b'], 'my-project'),
        createTestConversation(['a'], 'my-project')
      ];

      const result = analyzeProjectKeywords(conversations, 'my-project');

      const counts = result.keywords.map(k => k.count);
      for (let i = 0; i < counts.length - 1; i++) {
        expect(counts[i]).toBeGreaterThanOrEqual(counts[i + 1]);
      }
    });

    test('should skip conversations without keywords property', () => {
      const conversations = [
        createTestConversation(['typescript'], 'my-project'),
        { id: 'conv2', project: 'my-project' }, // No keywords property
        createTestConversation(['react'], 'my-project')
      ];

      const result = analyzeProjectKeywords(conversations, 'my-project');

      expect(result.totalConversations).toBe(3); // All conversations for this project
      expect(result.conversationsWithKeywords).toBe(2); // Only those with keywords
      expect(result.keywords.length).toBe(2);
    });

    test('should handle single conversation with many keywords', () => {
      const keywords = Array.from({ length: 15 }, (_, i) => `keyword${i}`);
      const conversations = [
        createTestConversation(keywords, 'my-project')
      ];

      const result = analyzeProjectKeywords(conversations, 'my-project');

      expect(result.totalConversations).toBe(1);
      expect(result.conversationsWithKeywords).toBe(1);
      expect(result.keywords.length).toBe(10); // Limited to top 10

      // All counts should be 1
      for (const kw of result.keywords) {
        expect(kw.count).toBe(1);
      }
    });

    test('should return correct structure', () => {
      const conversations = [
        createTestConversation(['typescript', 'api'], 'my-project')
      ];

      const result = analyzeProjectKeywords(conversations, 'my-project');

      expect(result).toHaveProperty('project');
      expect(result).toHaveProperty('totalConversations');
      expect(result).toHaveProperty('conversationsWithKeywords');
      expect(result).toHaveProperty('keywords');
      expect(typeof result.totalConversations).toBe('number');
      expect(Array.isArray(result.keywords)).toBe('true'.toLowerCase() === 'true' || Array.isArray(result.keywords));
    });

    test('should handle empty conversations array', () => {
      const result = analyzeProjectKeywords([], 'my-project');

      expect(result.project).toBe('my-project');
      expect(result.totalConversations).toBe(0);
      expect(result.conversationsWithKeywords).toBe(0);
      expect(result.keywords).toEqual([]);
    });

    test('should handle null or empty project name', () => {
      const conversations = [
        createTestConversation(['typescript'], 'proj1')
      ];

      const result1 = analyzeProjectKeywords(conversations, null);
      expect(result1.keywords).toEqual([]);

      const result2 = analyzeProjectKeywords(conversations, '');
      expect(result2.keywords).toEqual([]);
    });

    test('should filter conversations by project name correctly', () => {
      const conversations = [
        createTestConversation(['typescript', 'api'], 'project-a'),
        createTestConversation(['python', 'ml'], 'project-b'),
        createTestConversation(['react'], 'project-a'),
        createTestConversation(['nodejs'], 'project-b')
      ];

      const resultA = analyzeProjectKeywords(conversations, 'project-a');
      const resultB = analyzeProjectKeywords(conversations, 'project-b');

      expect(resultA.totalConversations).toBe(2);
      const termsA = resultA.keywords.map(k => k.term);
      expect(termsA).toContain('typescript');
      expect(termsA).toContain('react');

      expect(resultB.totalConversations).toBe(2);
      const termsB = resultB.keywords.map(k => k.term);
      expect(termsB).toContain('python');
      expect(termsB).toContain('nodejs');
    });

    test('should calculate correct percentage for project keywords', () => {
      const conversations = [
        createTestConversation(['a', 'b', 'a', 'b', 'a'], 'my-project')
      ];

      const result = analyzeProjectKeywords(conversations, 'my-project');

      const keywordA = result.keywords.find(k => k.term === 'a');
      const keywordB = result.keywords.find(k => k.term === 'b');

      // 5 total occurrences: a=3, b=2
      // a = 3/5 = 60%, b = 2/5 = 40%
      expect(keywordA.percentage).toBe(60);
      expect(keywordB.percentage).toBe(40);
    });

    test('should normalize keywords to lowercase', () => {
      const conversations = [
        {
          id: 'conv1',
          keywords: ['TypeScript', { term: 'REACT', score: 0.9 }],
          project: 'my-project'
        }
      ];

      const result = analyzeProjectKeywords(conversations, 'my-project');

      const terms = result.keywords.map(k => k.term);
      expect(terms).toContain('typescript');
      expect(terms).toContain('react');
    });
  });
});
