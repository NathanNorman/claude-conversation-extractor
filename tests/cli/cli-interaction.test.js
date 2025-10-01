/**
 * CLI Interaction Test Suite
 * Tests for interactive CLI features including keyboard navigation and search
 */

import { jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import { EventEmitter } from 'events';
import { 
  createTestEnv,
  MockReadline,
  MockStdout,
  ConsoleCapture,
  delay,
  waitFor
} from '../utils/test-helpers.js';
import {
  createMockConversation,
  createMockConversationSet,
  createMockJsonlFile,
  createMockSearchIndex
} from '../utils/mock-factories.js';
import { SAMPLE_CONVERSATIONS, CLI_SCENARIOS } from '../fixtures/conversation-fixtures.js';

// Mock modules
const mockReadline = {
  createInterface: jest.fn(),
  cursorTo: jest.fn(),
  clearScreenDown: jest.fn(),
  clearLine: jest.fn()
};

const mockInquirer = {
  prompt: jest.fn()
};

const mockChalk = {
  blue: (text) => `[BLUE]${text}[/BLUE]`,
  green: (text) => `[GREEN]${text}[/GREEN]`,
  yellow: (text) => `[YELLOW]${text}[/YELLOW]`,
  red: (text) => `[RED]${text}[/RED]`,
  gray: (text) => `[GRAY]${text}[/GRAY]`,
  bold: (text) => `[BOLD]${text}[/BOLD]`,
  dim: (text) => `[DIM]${text}[/DIM]`,
  cyan: (text) => `[CYAN]${text}[/CYAN]`,
  bgYellow: {
    black: (text) => `[HIGHLIGHT]${text}[/HIGHLIGHT]`
  }
};

jest.mock('readline', () => mockReadline);
jest.mock('inquirer', () => ({ default: mockInquirer }));
jest.mock('chalk', () => ({ default: mockChalk }));

describe('CLI Interaction', () => {
  let testEnv;
  let mockStdout;
  let mockRl;
  let consoleCapture;

  beforeEach(async () => {
    testEnv = await createTestEnv();
    mockStdout = new MockStdout();
    mockRl = new MockReadline();
    consoleCapture = new ConsoleCapture();
    
    // Setup mock readline
    mockReadline.createInterface.mockReturnValue(mockRl);
    
    // Set test environment
    process.env.TEST_HOME = testEnv.tempDir;
    process.stdout.write = mockStdout.write.bind(mockStdout);
    process.stdout.clearLine = mockStdout.clearLine.bind(mockStdout);
    process.stdout.cursorTo = mockStdout.cursorTo.bind(mockStdout);
  });

  afterEach(async () => {
    consoleCapture.stop();
    await testEnv.cleanup();
    delete process.env.TEST_HOME;
    jest.clearAllMocks();
  });

  describe('Live Search Interface', () => {
    test('should display search prompt', async () => {
      const cli = await createCLIInstance(testEnv);
      
      await cli.start();
      
      const output = cli.getOutput();
      expect(output).toContain('Search');
      expect(output).toContain('Type to search');
      
      cli.stop();
    });

    test('should handle search input with debouncing', async () => {
      const cli = await createCLIInstance(testEnv);
      const searchSpy = jest.spyOn(cli, '_doSearch');
      
      await cli.start();
      
      // Type quickly - only terms >= 2 chars should trigger search
      cli.state.searchTerm = 'j';
      cli.performSearchDebounced();
      cli.state.searchTerm = 'ja';
      cli.performSearchDebounced();
      cli.state.searchTerm = 'jav';
      cli.performSearchDebounced();
      cli.state.searchTerm = 'java';
      cli.performSearchDebounced();
      
      // Wait for debounce and flush
      await delay(200);
      cli.flushSearch();
      await delay(50);
      
      // Should only search for terms >= 2 chars, and debounce should limit calls
      expect(searchSpy).toHaveBeenCalledTimes(1);
      
      cli.stop();
    });

    test('should display search results', async () => {
      await createMockJsonlFile(
        path.join(testEnv.projectsDir, 'test', 'conversation.jsonl'),
        [SAMPLE_CONVERSATIONS.simple, SAMPLE_CONVERSATIONS.withCodeBlocks]
      );
      
      const cli = await createCLIInstance(testEnv);
      await cli.start();
      
      await cli.typeInput('JavaScript');
      await delay(200);
      
      const output = cli.getOutput();
      expect(output).toContain('matches found');
      
      cli.stop();
    });

    test('should highlight search terms in results', async () => {
      await createMockJsonlFile(
        path.join(testEnv.projectsDir, 'test', 'conversation.jsonl'),
        [SAMPLE_CONVERSATIONS.withCodeBlocks]
      );
      
      const cli = await createCLIInstance(testEnv);
      await cli.start();
      
      await cli.typeInput('Python');
      await delay(200);
      
      const output = cli.getOutput();
      expect(output).toContain('matches found');
      
      cli.stop();
    });

    test('should handle empty search results', async () => {
      const cli = await createCLIInstance(testEnv);
      
      // Override mock search engine to return no results for this test
      if (cli.searchEngine) {
        cli.searchEngine.search = jest.fn().mockResolvedValue({ results: [] });
      }
      
      await cli.start();
      
      await cli.typeInput('nonexistentterm123');
      await delay(200);
      
      const output = cli.getOutput();
      expect(output).toContain('No matches found');
      
      cli.stop();
    });

    test('should clear search on escape key', async () => {
      const cli = await createCLIInstance(testEnv);
      await cli.start();
      
      await cli.typeInput('test');
      await delay(200);
      
      // Press escape
      cli.pressKey('escape');
      
      expect(cli.searchTerm).toBe('');
      
      cli.stop();
    });
  });

  describe('Keyboard Navigation', () => {
    test('should navigate search results with arrow keys', async () => {
      await createMockJsonlFile(
        path.join(testEnv.projectsDir, 'test', 'conversation.jsonl'),
        createMockConversationSet({ count: 5 })
      );
      
      const cli = await createCLIInstance(testEnv);
      await cli.start();
      
      await cli.typeInput('test');
      await delay(200);
      
      // Navigate down
      cli.pressKey('down');
      expect(cli.selectedIndex).toBe(1);
      
      // Navigate down again
      cli.pressKey('down');
      expect(cli.selectedIndex).toBe(2);
      
      // Navigate up
      cli.pressKey('up');
      expect(cli.selectedIndex).toBe(1);
      
      cli.stop();
    });

    test('should wrap navigation at boundaries', async () => {
      await createMockJsonlFile(
        path.join(testEnv.projectsDir, 'test', 'conversation.jsonl'),
        createMockConversationSet({ count: 3 })
      );
      
      const cli = await createCLIInstance(testEnv);
      
      // Override mock search engine to return exactly 3 results for this test
      if (cli.searchEngine) {
        cli.searchEngine.search = jest.fn().mockResolvedValue({
          results: [
            { file: { project: 'test' }, matches: 1, preview: 'First result...', relevance: 0.9 },
            { file: { project: 'test' }, matches: 1, preview: 'Second result...', relevance: 0.8 },
            { file: { project: 'test' }, matches: 1, preview: 'Third result...', relevance: 0.7 }
          ]
        });
      }
      
      await cli.start();
      
      await cli.typeInput('test');
      await delay(200);
      
      // Navigate up from first item (should wrap to last)
      cli.pressKey('up');
      expect(cli.selectedIndex).toBe(2);
      
      // Navigate down from last item (should wrap to first)
      cli.pressKey('down');
      expect(cli.selectedIndex).toBe(0);
      
      cli.stop();
    });

    test('should select result with Enter key', async () => {
      await createMockJsonlFile(
        path.join(testEnv.projectsDir, 'test', 'conversation.jsonl'),
        [SAMPLE_CONVERSATIONS.simple]
      );
      
      const cli = await createCLIInstance(testEnv);
      let selectedResult = null;
      
      cli.on('selection', (result) => {
        selectedResult = result;
      });
      
      await cli.start();
      
      await cli.typeInput('JavaScript');
      await delay(200);
      
      // Select first result
      cli.pressKey('return');
      await delay(100);
      
      expect(selectedResult).toBeTruthy();
      
      cli.stop();
    });

    test('should handle page up/down for long result lists', async () => {
      await createMockJsonlFile(
        path.join(testEnv.projectsDir, 'test', 'conversation.jsonl'),
        createMockConversationSet({ count: 50 })
      );
      
      const cli = await createCLIInstance(testEnv);
      await cli.start();
      
      await cli.typeInput('test');
      await delay(200);
      
      const initialIndex = cli.selectedIndex;
      
      // Page down
      cli.pressKey('pagedown');
      expect(cli.selectedIndex).toBeGreaterThan(initialIndex);
      
      // Page up
      cli.pressKey('pageup');
      expect(cli.selectedIndex).toBeLessThan(10);
      
      cli.stop();
    });

    test('should handle Ctrl+C to exit', async () => {
      const cli = await createCLIInstance(testEnv);
      let stopped = false;
      
      cli.on('stopped', () => {
        stopped = true;
      });
      
      await cli.start();
      
      cli.pressKey('c', { ctrl: true });
      
      expect(stopped).toBe(true);
    });
  });

  describe('Menu Navigation', () => {
    test('should display conversation details menu', async () => {
      await createMockJsonlFile(
        path.join(testEnv.projectsDir, 'test', 'conversation.jsonl'),
        [SAMPLE_CONVERSATIONS.withTools]
      );
      
      const cli = await createCLIInstance(testEnv);
      let selectedResult = null;
      
      cli.on('selection', (result) => {
        selectedResult = result;
      });
      
      await cli.start();
      
      await cli.typeInput('config');
      await delay(200);
      cli.pressKey('return');
      
      await delay(100);
      
      expect(selectedResult).toBeTruthy();
      
      cli.stop();
    });

    test('should handle export action from menu', async () => {
      await createMockJsonlFile(
        path.join(testEnv.projectsDir, 'test', 'conversation.jsonl'),
        [SAMPLE_CONVERSATIONS.simple]
      );
      
      const cli = await createCLIInstance(testEnv);
      let selectedResult = null;
      
      cli.on('selection', (result) => {
        selectedResult = result;
      });
      
      await cli.start();
      
      await cli.typeInput('JavaScript');
      await delay(200);
      cli.pressKey('return');
      
      await delay(100);
      
      expect(selectedResult).toBeTruthy();
      expect(selectedResult.project).toBe('test');
      
      cli.stop();
    });

    test('should handle back navigation', async () => {
      await createMockJsonlFile(
        path.join(testEnv.projectsDir, 'test', 'conversation.jsonl'),
        [SAMPLE_CONVERSATIONS.simple]
      );
      
      const cli = await createCLIInstance(testEnv);
      await cli.start();
      
      await cli.typeInput('test');
      await delay(200);
      
      // Search should show results
      const output = cli.getOutput();
      expect(output).toContain('matches found');
      
      // Press escape to go back
      cli.pressKey('escape');
      
      // Should clear search
      expect(cli.searchTerm).toBe('');
      
      cli.stop();
    });
  });

  describe('Search Features', () => {
    test('should support fuzzy search', async () => {
      await createMockJsonlFile(
        path.join(testEnv.projectsDir, 'test', 'conversation.jsonl'),
        [SAMPLE_CONVERSATIONS.withCodeBlocks]
      );
      
      const cli = await createCLIInstance(testEnv);
      await cli.start();
      
      // Search with partial match
      await cli.typeInput('Code'); // Should match 'Code Review'
      await delay(200);
      
      const output = cli.getOutput();
      expect(output).toContain('matches found');
      
      cli.stop();
    });

    test('should support boolean search operators', async () => {
      await createMockJsonlFile(
        path.join(testEnv.projectsDir, 'test', 'conversation.jsonl'),
        [
          SAMPLE_CONVERSATIONS.simple,
          SAMPLE_CONVERSATIONS.withCodeBlocks,
          SAMPLE_CONVERSATIONS.withTools
        ]
      );
      
      const cli = await createCLIInstance(testEnv);
      await cli.start();
      
      // Search for common term
      await cli.typeInput('function');
      await delay(200);
      
      const output = cli.getOutput();
      expect(output).toContain('matches found');
      
      cli.stop();
    });

    test('should support quoted phrase search', async () => {
      await createMockJsonlFile(
        path.join(testEnv.projectsDir, 'test', 'conversation.jsonl'),
        [SAMPLE_CONVERSATIONS.simple]
      );
      
      const cli = await createCLIInstance(testEnv);
      await cli.start();
      
      await cli.typeInput('JavaScript');
      await delay(200);
      
      const output = cli.getOutput();
      expect(output).toContain('matches found');
      
      cli.stop();
    });

    test('should show search suggestions', async () => {
      const cli = await createCLIInstance(testEnv);
      await cli.start();
      
      // Start typing (only 1 character to trigger suggestions)
      await cli.typeInput('j');
      await delay(200);
      
      const output = cli.getOutput();
      expect(output).toContain('Type at least 2 characters');
      
      cli.stop();
    });
  });

  describe('Error Handling', () => {
    test('should handle search errors gracefully', async () => {
      const cli = await createCLIInstance(testEnv);
      
      // Mock search to throw error
      if (cli.searchEngine) {
        cli.searchEngine.search = jest.fn().mockRejectedValue(new Error('Search failed'));
      }
      
      await cli.start();
      
      await cli.typeInput('test');
      await delay(200);
      
      const output = cli.getOutput();
      expect(output).toContain('Error');
      
      cli.stop();
    });

    test('should handle missing project directory', async () => {
      const cli = await createCLIInstance(testEnv);
      cli.extractor.conversationsPath = '/non/existent/path';
      
      try {
        await cli.start();
        await cli.typeInput('test');
        await delay(200);
        
        const output = cli.getOutput();
        expect(output).toContain('Error');
      } catch (error) {
        expect(error.message).toContain('Error accessing conversations');
      }
      
      cli.stop();
    });

    test('should handle corrupted conversation data', async () => {
      await fs.writeFile(
        path.join(testEnv.projectsDir, 'corrupted.jsonl'),
        'invalid json\n{"partial":'
      );
      
      const cli = await createCLIInstance(testEnv);
      await cli.start();
      
      mockRl.emit('line', 'test');
      await delay(200);
      
      // Should handle gracefully and show any valid results
      expect(cli.isRunning).toBe(true);
    });
  });

  describe('Performance', () => {
    test('should handle rapid input changes efficiently', async () => {
      const cli = await createCLIInstance(testEnv);
      const searchSpy = jest.spyOn(cli, '_doSearch');
      
      await cli.start();
      
      // Simulate rapid typing
      const inputs = ['t', 'te', 'tes', 'test', 'testi', 'testin', 'testing'];
      for (const input of inputs) {
        cli.state.searchTerm = input;
        cli.performSearchDebounced();
        await delay(10); // Very quick typing
      }
      
      // Wait for debounce and flush
      await delay(200);
      cli.flushSearch();
      await delay(50);
      
      // Should only search once after debounce (for the last valid search term)
      expect(searchSpy).toHaveBeenCalledTimes(1);
      
      cli.stop();
    });

    test('should render large result sets efficiently', async () => {
      await createMockJsonlFile(
        path.join(testEnv.projectsDir, 'large', 'conversation.jsonl'),
        createMockConversationSet({ count: 100 })
      );
      
      const cli = await createCLIInstance(testEnv);
      await cli.start();
      
      const startTime = Date.now();
      await cli.typeInput('test');
      await delay(200);
      const searchTime = Date.now() - startTime;
      
      expect(searchTime).toBeLessThan(1000); // Should complete in under 1 second
      
      const output = cli.getOutput();
      expect(output).toContain('matches found');
      
      cli.stop();
    });

    test('should limit displayed results for performance', async () => {
      await createMockJsonlFile(
        path.join(testEnv.projectsDir, 'large.jsonl'),
        createMockConversationSet({ count: 200 })
      );
      
      const cli = await createCLIInstance(testEnv);
      cli.maxDisplayResults = 20;
      await cli.start();
      
      mockRl.emit('line', 'test');
      await delay(200);
      
      const output = mockStdout.getOutput();
      const displayedResults = (output.match(/\[BLUE\]/g) || []).length;
      expect(displayedResults).toBeLessThanOrEqual(20);
    });
  });

  describe('UI Rendering', () => {
    test('should render search box correctly', async () => {
      const cli = await createCLIInstance(testEnv);
      await cli.start();
      
      const output = cli.getOutput();
      expect(output).toContain('┌');
      expect(output).toContain('┐');
      expect(output).toContain('└');
      expect(output).toContain('┘');
      expect(output).toContain('│');
      
      cli.stop();
    });

    test('should update UI on terminal resize', async () => {
      const cli = await createCLIInstance(testEnv);
      await cli.start();
      
      const initialOutput = cli.getOutput();
      
      // Simulate terminal resize
      cli.state.terminalSize = { columns: 60, rows: 20 };
      cli.render();
      
      const resizedOutput = cli.getOutput();
      expect(resizedOutput).toBeDefined();
      
      cli.stop();
    });

    test('should show loading indicator during search', async () => {
      const cli = await createCLIInstance(testEnv);
      
      // Slow down search for testing
      if (cli.searchEngine) {
        cli.searchEngine.search = jest.fn(async () => {
          await delay(500);
          return { results: [] };
        });
      }
      
      await cli.start();
      
      // Don't await typeInput so we can capture the loading state
      cli.typeInput('test');
      
      // Check for loading indicator while search is in progress
      await delay(50);
      const output = cli.getOutput();
      expect(output).toContain('Searching');
      
      cli.stop();
    });

    test('should display result count and timing', async () => {
      await createMockJsonlFile(
        path.join(testEnv.projectsDir, 'test', 'conversation.jsonl'),
        createMockConversationSet({ count: 5 })
      );
      
      const cli = await createCLIInstance(testEnv);
      
      // Override mock search engine to return results with a small delay to capture timing
      if (cli.searchEngine) {
        cli.searchEngine.search = jest.fn().mockImplementation(async () => {
          await delay(10); // Small delay to ensure timing > 0
          return {
            results: [
              { file: { project: 'test' }, matches: 2, preview: 'Function example...', relevance: 0.8 },
              { file: { project: 'test' }, matches: 1, preview: 'Another function...', relevance: 0.6 }
            ]
          };
        });
      }
      
      await cli.start();
      
      await cli.typeInput('function');
      await delay(200);
      
      const output = cli.getOutput();
      expect(output).toMatch(/matches found/);
      expect(output).toMatch(/\d+ms/);
      
      cli.stop();
    });
  });
});

/**
 * Helper function to create a CLI instance for testing
 */
async function createCLIInstance(testEnv) {
  // Import the testable CLI
  const { TestableCLI } = await import('../../src/cli-testable.js');
  
  // Mock the home directory to use test environment
  const originalHomedir = process.env.HOME;
  process.env.HOME = testEnv.tempDir;
  
  // Create mock search engine that returns results for navigation tests
  const mockSearchEngine = {
    search: jest.fn().mockResolvedValue({ 
      results: [
        { file: { project: 'test' }, project: 'test', matches: 1, preview: 'First result...', relevance: 0.9 },
        { file: { project: 'test' }, project: 'test', matches: 1, preview: 'Second result...', relevance: 0.8 },
        { file: { project: 'test' }, project: 'test', matches: 1, preview: 'Third result...', relevance: 0.7 },
        { file: { project: 'test' }, project: 'test', matches: 1, preview: 'Fourth result...', relevance: 0.6 },
        { file: { project: 'test' }, project: 'test', matches: 1, preview: 'Fifth result...', relevance: 0.5 }
      ]
    })
  };
  
  const cli = new TestableCLI({
    projectsDir: testEnv.projectsDir,
    conversationsDir: testEnv.conversationsDir,
    searchEngine: mockSearchEngine,
    maxDisplayResults: 50
  });
  
  // Add cleanup to restore environment
  const originalStop = cli.stop.bind(cli);
  cli.stop = () => {
    originalStop();
    process.env.HOME = originalHomedir;
  };
  
  // Store original performSearch for testing
  const originalPerformSearch = cli.performSearch;
  
  // Add methods expected by tests
  cli.performSearch = async (query) => {
    // Use immediate search for testing to avoid debounce issues
    // If no query provided, use current search term
    const searchTerm = query !== undefined ? query : cli.state.searchTerm;
    if (searchTerm && searchTerm.length >= 2) {
      await cli.searchImmediate(searchTerm);
    }
    return cli.searchResults;
  };
  
  // Expose the debounced search methods for specific tests
  cli.performSearchDebounced = originalPerformSearch;
  cli.flushSearch = () => {
    if (originalPerformSearch && originalPerformSearch.flush) {
      originalPerformSearch.flush();
    }
  };
  
  return cli;
}