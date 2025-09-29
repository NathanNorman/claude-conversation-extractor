/**
 * Search Highlighting Regression Tests
 *
 * These tests ensure that search term highlighting and preview functionality
 * never regress. They specifically test for the bug where fullText was not
 * preserved through the save/load cycle, causing highlighting to fail.
 */

import { jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import {
  createTestEnv,
  cleanupDir
} from '../utils/test-helpers.js';

let MiniSearchEngine;

beforeAll(async () => {
  const module = await import('../../src/search/minisearch-engine.js');
  MiniSearchEngine = module.MiniSearchEngine || module.default;
});

describe('Search Highlighting Regression Tests', () => {
  let testEnv;
  let searchEngine;

  beforeEach(async () => {
    testEnv = await createTestEnv();
    searchEngine = new MiniSearchEngine({
      projectsDir: testEnv.projectsDir,
      indexPath: path.join(testEnv.conversationsDir, 'search-index-v2.json'),
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
      }
    });
  });

  afterEach(async () => {
    await cleanupDir(testEnv.tempDir);
  });

  describe('FullText Preservation', () => {
    test('REGRESSION: fullText must be stored in conversationData for processedConversations', async () => {
      // This tests the first code path (when processedConversations are provided)
      const processedConversations = [
        {
          id: 'test-conv-1',
          project: 'TestProject',
          fullText: 'This conversation contains fastmutation and other search terms',
          preview: 'This conversation contains...',
          modified: new Date().toISOString(),
          wordCount: 10,
          messageCount: 5
        }
      ];

      await searchEngine.buildIndex(processedConversations);

      // CRITICAL: conversationData MUST have fullText
      const storedConv = searchEngine.conversationData.get('test-conv-1');
      expect(storedConv).toBeDefined();
      expect(storedConv.fullText).toBeDefined();
      expect(storedConv.fullText).toBe('This conversation contains fastmutation and other search terms');
      expect(storedConv._fullText).toBeDefined();
      expect(storedConv.content).toBeDefined();
    });

    test('REGRESSION: fullText must be stored in conversationData for JSONL files', async () => {
      // This tests using processedConversations (new architecture-agnostic approach)
      const processedConversations = [{
        id: 'test-conv-2',
        project: 'TestProject',
        fullText: 'Tell me about fastmutation. Fastmutation is a data mutation library.',
        preview: 'Tell me about fastmutation...',
        modified: new Date().toISOString(),
        wordCount: 11,
        messageCount: 2
      }];

      await searchEngine.buildIndex(processedConversations);

      // CRITICAL: conversationData MUST have fullText
      const storedConv = searchEngine.conversationData.get('test-conv-2');
      expect(storedConv).toBeDefined();
      expect(storedConv.fullText).toBeDefined();
      expect(storedConv.fullText.length).toBeGreaterThan(0);
      expect(storedConv.fullText.toLowerCase()).toContain('fastmutation');
    });

    test('REGRESSION: fullText must be preserved through save/load cycle', async () => {
      // Create conversation with fullText
      const fullText = 'Search for fastmutation in the codebase\n\nI will search for fastmutation references';
      const processedConversations = [{
        id: 'test-conv-3',
        project: 'TestProject',
        fullText: fullText,
        preview: 'Search for fastmutation in the codebase...',
        modified: new Date().toISOString(),
        wordCount: 11,
        messageCount: 2
      }];

      // Build and save
      await searchEngine.buildIndex(processedConversations);
      const fullTextBeforeSave = Array.from(searchEngine.conversationData.values())[0].fullText;
      expect(fullTextBeforeSave).toBeDefined();

      await searchEngine.saveIndex();

      // Load in new engine instance
      const newEngine = new MiniSearchEngine({
        projectsDir: testEnv.projectsDir,
        indexPath: path.join(testEnv.conversationsDir, 'search-index-v2.json'),
        logger: searchEngine.logger
      });

      const loaded = await newEngine.loadIndex();
      expect(loaded).toBe(true);

      // CRITICAL: fullText must exist after loading
      const fullTextAfterLoad = Array.from(newEngine.conversationData.values())[0].fullText;
      expect(fullTextAfterLoad).toBeDefined();
      expect(fullTextAfterLoad).toBe(fullTextBeforeSave);
      expect(fullTextAfterLoad.toLowerCase()).toContain('fastmutation');
    });

    test('REGRESSION: saved index file must contain fullText in conversationData', async () => {
      const fullText = 'Test message with searchable term';
      const processedConversations = [{
        id: 'test-conv-4',
        project: 'TestProject',
        fullText: fullText,
        preview: 'Test message with searchable term',
        modified: new Date().toISOString(),
        wordCount: 5,
        messageCount: 1
      }];

      await searchEngine.buildIndex(processedConversations);
      await searchEngine.saveIndex();

      // Read the saved file directly
      const indexPath = path.join(testEnv.conversationsDir, 'search-index-v2.json');
      const savedData = JSON.parse(await fs.readFile(indexPath, 'utf-8'));

      // CRITICAL: The saved file must have fullText in conversationData
      expect(savedData.conversationData).toBeDefined();
      expect(savedData.conversationData.length).toBeGreaterThan(0);

      const firstSavedConv = savedData.conversationData[0][1];
      expect(firstSavedConv.fullText).toBeDefined();
      expect(firstSavedConv.fullText.length).toBeGreaterThan(0);
    });
  });

  describe('Search Result Highlighting', () => {
    test('REGRESSION: search results must have occurrences array with previews', async () => {
      const fullText = 'Tell me about fastmutation and how to use it\n\nFastmutation is great for mutations';
      const processedConversations = [{
        id: 'test-conv-5',
        project: 'TestProject',
        fullText: fullText,
        preview: 'Tell me about fastmutation and how to use it...',
        modified: new Date().toISOString(),
        wordCount: 14,
        messageCount: 2
      }];

      await searchEngine.buildIndex(processedConversations);
      const results = await searchEngine.search('fastmutation', { limit: 10 });

      // CRITICAL: Results must have occurrences array
      expect(results.results.length).toBeGreaterThan(0);
      const firstResult = results.results[0];

      expect(firstResult.occurrences).toBeDefined();
      expect(Array.isArray(firstResult.occurrences)).toBe(true);
      expect(firstResult.occurrences.length).toBeGreaterThan(0);

      // CRITICAL: Each occurrence must have a preview property
      const firstOcc = firstResult.occurrences[0];
      expect(firstOcc.preview).toBeDefined();
      expect(typeof firstOcc.preview).toBe('string');
    });

    test('REGRESSION: occurrence previews must contain [HIGHLIGHT] markers', async () => {
      const fullText = 'Working on fastmutation feature implementation';
      const processedConversations = [{
        id: 'test-conv-6',
        project: 'TestProject',
        fullText: fullText,
        preview: 'Working on fastmutation feature implementation',
        modified: new Date().toISOString(),
        wordCount: 5,
        messageCount: 1
      }];

      await searchEngine.buildIndex(processedConversations);
      const results = await searchEngine.search('fastmutation', { limit: 1 });

      const firstResult = results.results[0];
      expect(firstResult.occurrences.length).toBeGreaterThan(0);

      // CRITICAL: Occurrence preview must have [HIGHLIGHT] markers
      const occPreview = firstResult.occurrences[0].preview;
      expect(occPreview).toContain('[HIGHLIGHT]');
      expect(occPreview).toContain('[/HIGHLIGHT]');

      // Verify the highlighted text is the search term
      const highlightMatch = occPreview.match(/\[HIGHLIGHT\](.*?)\[\/HIGHLIGHT\]/);
      expect(highlightMatch).toBeTruthy();
      expect(highlightMatch[1].toLowerCase()).toContain('fastmutation');
    });

    test('REGRESSION: result.preview must contain [HIGHLIGHT] markers', async () => {
      const fullText = 'Testing fastmutation highlighting';
      const processedConversations = [{
        id: 'test-conv-7',
        project: 'TestProject',
        fullText: fullText,
        preview: 'Testing fastmutation highlighting',
        modified: new Date().toISOString(),
        wordCount: 3,
        messageCount: 1
      }];

      await searchEngine.buildIndex(processedConversations);
      const results = await searchEngine.search('fastmutation', { limit: 1 });

      const firstResult = results.results[0];

      // CRITICAL: The main result preview must have highlighting
      expect(firstResult.preview).toBeDefined();
      expect(firstResult.preview).toContain('[HIGHLIGHT]');
      expect(firstResult.preview).toContain('[/HIGHLIGHT]');
    });

    test('REGRESSION: preview must contain the actual search term', async () => {
      const fullText = 'Some text before. Here is fastmutation in the middle. Some text after.';
      const processedConversations = [{
        id: 'test-conv-8',
        project: 'TestProject',
        fullText: fullText,
        preview: 'Some text before. Here is fastmutation in the middle. Some text after.',
        modified: new Date().toISOString(),
        wordCount: 13,
        messageCount: 1
      }];

      await searchEngine.buildIndex(processedConversations);
      const results = await searchEngine.search('fastmutation', { limit: 1 });

      const firstResult = results.results[0];

      // CRITICAL: The preview must actually contain the search term
      expect(firstResult.preview.toLowerCase()).toContain('fastmutation');

      // CRITICAL: The search term must be highlighted in the preview
      const highlighted = firstResult.preview.match(/\[HIGHLIGHT\]([^[]+)\[\/HIGHLIGHT\]/);
      expect(highlighted).toBeTruthy();
      expect(highlighted[1].toLowerCase()).toContain('fastmutation');
    });

    test('REGRESSION: multiple occurrences must each have unique previews', async () => {
      // Create a longer text with occurrences far apart to ensure different previews
      const fillerText = 'Lorem ipsum dolor sit amet. '.repeat(30);
      const fullText = 'First fastmutation mention here at the start. ' + fillerText + '\n\n' +
                       fillerText + '\n\n' +
                       fillerText + ' Second fastmutation mention at the end';
      const processedConversations = [{
        id: 'test-conv-9',
        project: 'TestProject',
        fullText: fullText,
        preview: 'First fastmutation mention here at the start...',
        modified: new Date().toISOString(),
        wordCount: 200,
        messageCount: 3
      }];

      await searchEngine.buildIndex(processedConversations);
      const results = await searchEngine.search('fastmutation', { limit: 1 });

      const firstResult = results.results[0];

      // Should find 2 occurrences
      expect(firstResult.totalOccurrences).toBeGreaterThanOrEqual(2);
      expect(firstResult.occurrences.length).toBeGreaterThanOrEqual(2);

      // CRITICAL: Each occurrence must have highlighting
      const preview1 = firstResult.occurrences[0].preview;
      const preview2 = firstResult.occurrences[1].preview;

      expect(preview1).toContain('[HIGHLIGHT]');
      expect(preview2).toContain('[HIGHLIGHT]');

      // Each should show different surrounding context (with enough filler, they'll be different)
      expect(preview1.toLowerCase()).toContain('first');
      expect(preview2.toLowerCase()).toContain('second');
    });
  });

  describe('Index Save/Load Integrity', () => {
    test('REGRESSION: loadIndex must not lose fullText data', async () => {
      const testConversations = [
        {
          id: 'conv-1',
          project: 'TestProject',
          fullText: 'This is test content with searchable terms like fastmutation',
          preview: 'This is test content...',
          modified: new Date().toISOString(),
          wordCount: 10,
          messageCount: 2
        }
      ];

      // Build with processedConversations
      await searchEngine.buildIndex(testConversations);

      // Verify fullText exists before save
      const convBefore = searchEngine.conversationData.get('conv-1');
      expect(convBefore.fullText).toBeDefined();
      const fullTextBefore = convBefore.fullText;

      await searchEngine.saveIndex();

      // Create new engine and load
      const newEngine = new MiniSearchEngine({
        projectsDir: testEnv.projectsDir,
        indexPath: path.join(testEnv.conversationsDir, 'search-index-v2.json'),
        logger: searchEngine.logger
      });

      await newEngine.loadIndex();

      // CRITICAL: fullText must exist after load
      const convAfter = newEngine.conversationData.get('conv-1');
      expect(convAfter).toBeDefined();
      expect(convAfter.fullText).toBeDefined();
      expect(convAfter.fullText).toBe(fullTextBefore);
    });

    test('REGRESSION: search after load must produce highlighted results', async () => {
      const fullText = 'Question about fastmutation implementation\n\nHere is how fastmutation works';
      const processedConversations = [{
        id: 'test-conv-10',
        project: 'TestProject',
        fullText: fullText,
        preview: 'Question about fastmutation implementation...',
        modified: new Date().toISOString(),
        wordCount: 9,
        messageCount: 2
      }];

      // Build and save
      await searchEngine.buildIndex(processedConversations);
      await searchEngine.saveIndex();

      // Load in fresh engine
      const newEngine = new MiniSearchEngine({
        projectsDir: testEnv.projectsDir,
        indexPath: path.join(testEnv.conversationsDir, 'search-index-v2.json'),
        logger: searchEngine.logger
      });

      await newEngine.loadIndex();

      // Search with the loaded engine
      const results = await newEngine.search('fastmutation', { limit: 1 });

      // CRITICAL: Search after loading must work with highlighting
      expect(results.results.length).toBeGreaterThan(0);

      const result = results.results[0];
      expect(result.occurrences).toBeDefined();
      expect(result.occurrences.length).toBeGreaterThan(0);
      expect(result.preview).toContain('[HIGHLIGHT]');
      expect(result.preview.toLowerCase()).toContain('fastmutation');
    });

    test('REGRESSION: preview must show search term context, not beginning of document', async () => {
      const filler1 = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(20);
      const filler2 = 'More filler text. '.repeat(20);
      const filler3 = 'More filler at the end. '.repeat(20);
      const fullText = filler1 + '\n\n' + filler2 + '\n\nNow we talk about fastmutation here in the middle\n\n' + filler3;
      const processedConversations = [{
        id: 'test-conv-11',
        project: 'TestProject',
        fullText: fullText,
        preview: 'Lorem ipsum dolor sit amet...',
        modified: new Date().toISOString(),
        wordCount: 150,
        messageCount: 4
      }];

      await searchEngine.buildIndex(processedConversations);
      const results = await searchEngine.search('fastmutation', { limit: 1 });

      const result = results.results[0];

      // CRITICAL: Preview must contain the search term, not just beginning of document
      expect(result.preview.toLowerCase()).toContain('fastmutation');

      // CRITICAL: Preview should NOT just be the beginning (Lorem ipsum)
      // It should be the context around where fastmutation appears
      expect(result.preview).toContain('[HIGHLIGHT]');

      // The preview should be from the middle where fastmutation appears
      expect(result.preview.toLowerCase()).toContain('middle');
    });
  });

  describe('Occurrence Navigation Data', () => {
    test('REGRESSION: results must have totalOccurrences and currentOccurrenceIndex', async () => {
      const fullText = 'fastmutation is great and fastmutation is fast';
      const processedConversations = [{
        id: 'test-conv-12',
        project: 'TestProject',
        fullText: fullText,
        preview: 'fastmutation is great and fastmutation is fast',
        modified: new Date().toISOString(),
        wordCount: 7,
        messageCount: 1
      }];

      await searchEngine.buildIndex(processedConversations);
      const results = await searchEngine.search('fastmutation', { limit: 1 });

      const result = results.results[0];

      // CRITICAL: Must have navigation data for UI
      expect(result.totalOccurrences).toBeDefined();
      expect(result.totalOccurrences).toBeGreaterThanOrEqual(2);
      expect(result.currentOccurrenceIndex).toBeDefined();
      expect(result.currentOccurrenceIndex).toBe(0);
    });

    test('REGRESSION: findAllOccurrences must find all instances', async () => {
      const fullText = 'fastmutation here and fastmutation there and fastmutation everywhere';

      const occurrences = searchEngine.findAllOccurrences(fullText, 'fastmutation', []);

      // CRITICAL: Must find all 3 occurrences
      expect(occurrences.length).toBe(3);

      // Each must have required properties
      occurrences.forEach(occ => {
        expect(occ.index).toBeDefined();
        expect(occ.length).toBeDefined();
        expect(occ.word.toLowerCase()).toBe('fastmutation');
      });
    });

    test('REGRESSION: generatePreviewForOccurrence must add [HIGHLIGHT] markers', async () => {
      const fullText = 'Some text before fastmutation and some text after';
      const occurrence = {
        index: fullText.indexOf('fastmutation'),
        length: 'fastmutation'.length,
        word: 'fastmutation'
      };

      const preview = searchEngine.generatePreviewForOccurrence(fullText, occurrence, 'fastmutation', []);

      // CRITICAL: Preview must have highlighting
      expect(preview).toContain('[HIGHLIGHT]');
      expect(preview).toContain('[/HIGHLIGHT]');
      expect(preview).toContain('fastmutation');

      // Verify structure
      const highlightMatch = preview.match(/\[HIGHLIGHT\](.*?)\[\/HIGHLIGHT\]/);
      expect(highlightMatch).toBeTruthy();
      expect(highlightMatch[1].toLowerCase()).toBe('fastmutation');
    });
  });
});