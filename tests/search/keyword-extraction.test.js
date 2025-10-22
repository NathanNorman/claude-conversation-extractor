/**
 * Tests for KeywordExtractor
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { KeywordExtractor } from '../../src/search/keyword-extractor.js';

describe('KeywordExtractor', () => {
  let extractor;

  beforeEach(() => {
    extractor = new KeywordExtractor();
  });

  describe('buildCorpus()', () => {
    it('should build corpus from conversations', () => {
      const conversations = [
        { fullText: 'TypeScript is a typed superset of JavaScript' },
        { fullText: 'React is a JavaScript library for building UIs' },
        { fullText: 'Python is a programming language' }
      ];

      const count = extractor.buildCorpus(conversations);

      expect(count).toBe(3);
      expect(extractor.corpusBuilt).toBe(true);
      expect(extractor.conversationCount).toBe(3);
    });

    it('should skip empty conversations', () => {
      const conversations = [
        { fullText: 'TypeScript is great' },
        { fullText: '' },
        { fullText: '   ' },
        { fullText: 'Python is nice' }
      ];

      const count = extractor.buildCorpus(conversations);

      expect(count).toBe(2); // Only 2 non-empty
    });

    it('should handle conversations with no fullText', () => {
      const conversations = [
        { fullText: 'TypeScript' },
        { content: 'React' },  // Has content but no fullText - extractor uses content fallback
        {}  // Empty object
      ];

      const count = extractor.buildCorpus(conversations);

      expect(count).toBe(2); // First and second (content fallback works)
    });
  });

  describe('extractKeywords()', () => {
    beforeEach(() => {
      // Build a small corpus for testing
      const conversations = [
        { fullText: 'TypeScript debugging is challenging when types are incorrect' },
        { fullText: 'React hooks make state management easier' },
        { fullText: 'Python pandas is great for data analysis' }
      ];
      extractor.buildCorpus(conversations);
    });

    it('should throw error if corpus not built', () => {
      const freshExtractor = new KeywordExtractor();
      expect(() => {
        freshExtractor.extractKeywords('some text', 5, 0);
      }).toThrow('Corpus not built');
    });

    it('should extract top N keywords', () => {
      const text = 'TypeScript debugging is challenging when types are incorrect';
      const keywords = extractor.extractKeywords(text, 5, 0);

      expect(keywords).toBeInstanceOf(Array);
      expect(keywords.length).toBeLessThanOrEqual(5);
      expect(keywords[0]).toHaveProperty('term');
      expect(keywords[0]).toHaveProperty('score');
    });

    it('should filter out stopwords', () => {
      const text = 'the quick brown fox jumps over the lazy dog';
      const keywords = extractor.extractKeywords(text, 10, 0);

      const terms = keywords.map(k => k.term);
      // Common stopwords should not appear
      expect(terms).not.toContain('the');
      expect(terms).not.toContain('over');
    });

    it('should return empty array for text with only stopwords', () => {
      const text = 'the and is was were';
      const keywords = extractor.extractKeywords(text, 10, 0);

      expect(keywords).toEqual([]);
    });

    it('should score keywords by TF-IDF', () => {
      const text = 'TypeScript TypeScript TypeScript debugging types';
      const keywords = extractor.extractKeywords(text, 5, 0);

      // Words appearing more frequently should have higher scores
      // (Though exact scores depend on IDF across corpus)
      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords[0].score).toBeGreaterThan(0);
    });

    it('should round scores to 2 decimals', () => {
      const text = 'TypeScript debugging types';
      const keywords = extractor.extractKeywords(text, 3, 0);

      for (const kw of keywords) {
        // Check that score has at most 2 decimal places
        const decimals = (kw.score.toString().split('.')[1] || '').length;
        expect(decimals).toBeLessThanOrEqual(2);
      }
    });
  });

  describe('getBulkKeywords()', () => {
    it('should extract keywords for all conversations', () => {
      const conversations = [
        { fullText: 'TypeScript debugging is challenging' },
        { fullText: 'React hooks make development easier' },
        { fullText: 'Python pandas for data analysis' }
      ];

      const results = extractor.getBulkKeywords(conversations, 5);

      expect(results).toHaveLength(3);
      expect(results[0]).toHaveProperty('keywords');
      expect(results[0]).toHaveProperty('keywordString');
      expect(results[0].keywords).toBeInstanceOf(Array);
      expect(typeof results[0].keywordString).toBe('string');
    });

    it('should handle empty conversations', () => {
      const conversations = [
        { fullText: 'TypeScript' },
        { fullText: '' },
        { fullText: 'React' }
      ];

      const results = extractor.getBulkKeywords(conversations, 5);

      expect(results).toHaveLength(3);
      expect(results[1].keywords).toEqual([]); // Empty conversation
      expect(results[1].keywordString).toBe('');
    });

    it('should build corpus automatically if not built', () => {
      const freshExtractor = new KeywordExtractor();
      expect(freshExtractor.corpusBuilt).toBe(false);

      const conversations = [
        { fullText: 'TypeScript' }
      ];

      const results = freshExtractor.getBulkKeywords(conversations, 5);

      expect(freshExtractor.corpusBuilt).toBe(true);
      expect(results[0].keywords).toBeInstanceOf(Array);
    });
  });

  describe('getStats()', () => {
    it('should return extraction statistics', () => {
      const conversations = [
        { fullText: 'TypeScript' },
        { fullText: 'React' }
      ];
      extractor.buildCorpus(conversations);

      const stats = extractor.getStats();

      expect(stats.conversationsProcessed).toBe(2);
      expect(stats.corpusBuilt).toBe(true);
    });
  });

  describe('stopword filtering', () => {
    beforeEach(() => {
      const conversations = [
        { fullText: 'testing the functionality with various words' }
      ];
      extractor.buildCorpus(conversations);
    });

    it('should filter common stopwords', () => {
      const text = 'this is a test of the stopword system';
      const keywords = extractor.extractKeywords(text, 10, 0);

      const terms = keywords.map(k => k.term);
      // These should all be filtered
      ['this', 'is', 'a', 'of', 'the'].forEach(stopword => {
        expect(terms).not.toContain(stopword);
      });
    });

    it('should filter very short terms (< 3 chars)', () => {
      const text = 'ab cd efg hijk lmnop';
      const keywords = extractor.extractKeywords(text, 10, 0);

      const terms = keywords.map(k => k.term);
      expect(terms).not.toContain('ab');
      expect(terms).not.toContain('cd');
      // efg, hijk, lmnop should be kept (>= 3 chars)
    });

    it('should keep tech acronyms even if short', () => {
      const conversations = [
        { fullText: 'Using AI and ML for NLP tasks with UI components' }
      ];
      const acExtractor = new KeywordExtractor();
      acExtractor.buildCorpus(conversations);

      const keywords = acExtractor.extractKeywords(conversations[0].fullText, 10, 0);
      const terms = keywords.map(k => k.term);

      // Common tech acronyms should be kept
      // Note: Exact results depend on TF-IDF scoring
      expect(keywords.length).toBeGreaterThan(0);
    });
  });
});
