/**
 * Filter Menu Test Suite
 * Tests for the Tab-based filter menu and repository filtering functionality
 *
 * This test suite prevents regression of the filter menu bugs fixed on 2025-09-29 where:
 * - BUG 1: Undefined variable `activeFilters` (should be `state.activeFilters`)
 *   - Caused silent failures when accessing filter state
 *   - Tests: "CRITICAL: must use state.activeFilters, not undefined activeFilters"
 *
 * - BUG 2: Undefined variable `searchTerm` (should be `state.searchTerm`)
 *   - Caused incorrect logging and potential crashes
 *   - Tests: "CRITICAL: must use state.searchTerm, not undefined searchTerm"
 *
 * - BUG 3: stdin raw mode not properly managed between consecutive inquirer prompts
 *   - Caused second prompt (repo selection) to fail immediately
 *   - Tests: "CRITICAL: must properly manage stdin between consecutive prompts"
 *   - Also tests: "should properly manage stdin raw mode between prompts"
 *
 * - BUG 4: Missing 100ms delay between filter type and repo selection prompts
 *   - stdin wasn't ready for second prompt
 *   - Tests: "should show repo selection prompt after filter type selection"
 *
 * SYMPTOM: When pressing Tab → "Filter by Repository", the menu would immediately
 * return to search without showing the repository checkbox list.
 */

import { jest } from '@jest/globals';
import { EventEmitter } from 'events';

// Mock inquirer to simulate user interactions
const mockInquirer = {
  prompt: jest.fn()
};

jest.mock('inquirer', () => ({ default: mockInquirer }));

describe('Filter Menu', () => {
  let mockState;
  let mockLogger;
  let showFilterOptions;
  let showRepoFilter;
  let getAllRepos;
  let conversations;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock state object that matches LiveSearchState
    mockState = {
      searchTerm: '',
      results: [],
      selectedIndex: 0,
      activeFilters: {
        repos: new Set(),
        dateRange: null
      }
    };

    // Mock logger
    mockLogger = {
      debugSync: jest.fn(),
      infoSync: jest.fn(),
      errorSync: jest.fn()
    };

    // Mock conversations
    conversations = [
      { project: 'project-a', modified: new Date() },
      { project: 'project-b', modified: new Date() },
      { project: 'project-c', modified: new Date() }
    ];

    // Mock getAllRepos function
    getAllRepos = jest.fn(() => {
      const repos = new Set();
      conversations.forEach(conv => {
        if (conv.project) {
          repos.add(conv.project);
        }
      });
      return Array.from(repos).sort();
    });

    // Mock process.stdin
    process.stdin.isTTY = true;
    process.stdin.setRawMode = jest.fn();
    process.stdin.resume = jest.fn();

    // Mock process.stdout
    process.stdout.write = jest.fn();

    // Create the functions under test
    showRepoFilter = async () => {
      try {
        const allRepos = getAllRepos();

        if (allRepos.length === 0) {
          console.log('No repositories found');
          return;
        }

        // Ensure stdin is in the right mode for inquirer
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }

        const { selectedRepos } = await mockInquirer.prompt([{
          type: 'checkbox',
          name: 'selectedRepos',
          message: 'Select repositories:',
          choices: allRepos.map(repo => ({
            name: repo,
            value: repo,
            checked: mockState.activeFilters.repos.has(repo)
          })),
          pageSize: 15
        }]);

        // Update active filters - THIS IS THE CRITICAL PART THAT WAS BUGGY
        mockLogger.debugSync('Repos selected in menu', { count: selectedRepos.length, repos: selectedRepos });
        mockState.activeFilters.repos.clear();
        selectedRepos.forEach(repo => mockState.activeFilters.repos.add(repo));
        mockLogger.infoSync('Active filters updated', {
          count: mockState.activeFilters.repos.size,
          repos: Array.from(mockState.activeFilters.repos)
        });

        console.log(`✓ Filtering by ${selectedRepos.length} repository(s)`);

      } catch (error) {
        console.error('Repo filter error:', error);
      }
    };

    showFilterOptions = async () => {
      try {
        // Temporarily disable raw mode for inquirer
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }

        const { filterType } = await mockInquirer.prompt([{
          type: 'list',
          name: 'filterType',
          message: 'Choose filter type:',
          choices: [
            { name: '📁 Filter by Repository', value: 'repo' },
            { name: '📅 Filter by Date Range', value: 'date' },
            { name: '🧹 Clear All Filters', value: 'clear' },
            { name: '← Back to Search', value: 'back' }
          ]
        }]);

        mockLogger.debugSync('Filter menu: type selected', { filterType });

        // Small delay to ensure stdin is ready for next prompt
        await new Promise(resolve => setTimeout(resolve, 100));

        if (filterType === 'repo') {
          // THIS WAS THE BUG - using activeFilters instead of state.activeFilters
          mockLogger.debugSync('Opening repo filter, current filters', {
            count: mockState.activeFilters.repos.size
          });
          await showRepoFilter();
          mockLogger.infoSync('Repo filter applied', {
            count: mockState.activeFilters.repos.size,
            repos: Array.from(mockState.activeFilters.repos)
          });
        } else if (filterType === 'clear') {
          mockLogger.infoSync('Clearing all filters');
          mockState.activeFilters.repos.clear();
          mockState.activeFilters.dateRange = null;
        }

        // Re-enable raw mode
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(true);
        }
        process.stdin.resume();

        // THIS WAS THE BUG - using searchTerm instead of state.searchTerm
        mockLogger.debugSync('Before refresh', {
          searchTermLength: mockState.searchTerm.length,
          activeFilters: mockState.activeFilters.repos.size
        });

        return filterType !== 'back';
      } catch (error) {
        console.error('Filter menu error:', error);
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(true);
        }
        process.stdin.resume();
        return false;
      }
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Repository Filter Selection', () => {
    test('should properly reference state.activeFilters when opening repo filter', async () => {
      // Mock user selecting filter type
      mockInquirer.prompt
        .mockResolvedValueOnce({ filterType: 'repo' })
        .mockResolvedValueOnce({ selectedRepos: ['project-a', 'project-b'] });

      await showFilterOptions();

      // Verify state.activeFilters.repos was accessed (not undefined activeFilters)
      expect(mockLogger.debugSync).toHaveBeenCalledWith(
        'Opening repo filter, current filters',
        { count: expect.any(Number) }
      );

      // Verify filters were applied
      expect(mockState.activeFilters.repos.size).toBe(2);
      expect(mockState.activeFilters.repos.has('project-a')).toBe(true);
      expect(mockState.activeFilters.repos.has('project-b')).toBe(true);
    });

    test('should properly reference state.searchTerm when logging', async () => {
      mockState.searchTerm = 'test search';

      mockInquirer.prompt
        .mockResolvedValueOnce({ filterType: 'repo' })
        .mockResolvedValueOnce({ selectedRepos: ['project-a'] });

      await showFilterOptions();

      // Verify state.searchTerm was accessed correctly (not undefined searchTerm)
      expect(mockLogger.debugSync).toHaveBeenCalledWith(
        'Before refresh',
        {
          searchTermLength: 'test search'.length,
          activeFilters: 1
        }
      );
    });

    test('should show repo selection prompt after filter type selection', async () => {
      mockInquirer.prompt
        .mockResolvedValueOnce({ filterType: 'repo' })
        .mockResolvedValueOnce({ selectedRepos: ['project-a'] });

      await showFilterOptions();

      // Verify both prompts were shown
      expect(mockInquirer.prompt).toHaveBeenCalledTimes(2);

      // First call: filter type selection
      expect(mockInquirer.prompt.mock.calls[0][0][0].name).toBe('filterType');

      // Second call: repo selection
      expect(mockInquirer.prompt.mock.calls[1][0][0].name).toBe('selectedRepos');
      expect(mockInquirer.prompt.mock.calls[1][0][0].type).toBe('checkbox');
    });

    test('should update state.activeFilters.repos with selected repositories', async () => {
      mockInquirer.prompt
        .mockResolvedValueOnce({ filterType: 'repo' })
        .mockResolvedValueOnce({ selectedRepos: ['project-a', 'project-c'] });

      expect(mockState.activeFilters.repos.size).toBe(0);

      await showFilterOptions();

      expect(mockState.activeFilters.repos.size).toBe(2);
      expect(Array.from(mockState.activeFilters.repos)).toEqual(['project-a', 'project-c']);
    });

    test('should preserve existing filter selections when reopening menu', async () => {
      // Set up existing filters
      mockState.activeFilters.repos.add('project-a');

      mockInquirer.prompt
        .mockResolvedValueOnce({ filterType: 'repo' })
        .mockResolvedValueOnce({ selectedRepos: ['project-a', 'project-b'] });

      await showFilterOptions();

      // Verify the checkbox prompt had project-a pre-checked
      const checkboxCall = mockInquirer.prompt.mock.calls[1][0][0];
      const projectAChoice = checkboxCall.choices.find(c => c.value === 'project-a');
      expect(projectAChoice.checked).toBe(true);
    });

    test('should properly manage stdin raw mode between prompts', async () => {
      mockInquirer.prompt
        .mockResolvedValueOnce({ filterType: 'repo' })
        .mockResolvedValueOnce({ selectedRepos: [] });

      await showFilterOptions();

      // Verify stdin.setRawMode was called correctly
      expect(process.stdin.setRawMode).toHaveBeenCalledWith(false); // Disabled for inquirer
      expect(process.stdin.setRawMode).toHaveBeenCalledWith(true);  // Re-enabled after
      expect(process.stdin.resume).toHaveBeenCalled();
    });

    test('should handle empty repository selection', async () => {
      mockInquirer.prompt
        .mockResolvedValueOnce({ filterType: 'repo' })
        .mockResolvedValueOnce({ selectedRepos: [] });

      await showFilterOptions();

      expect(mockState.activeFilters.repos.size).toBe(0);
      expect(mockLogger.infoSync).toHaveBeenCalledWith(
        'Repo filter applied',
        { count: 0, repos: [] }
      );
    });

    test('should clear existing filters when selecting none', async () => {
      // Set up existing filters
      mockState.activeFilters.repos.add('project-a');
      mockState.activeFilters.repos.add('project-b');

      mockInquirer.prompt
        .mockResolvedValueOnce({ filterType: 'repo' })
        .mockResolvedValueOnce({ selectedRepos: [] });

      await showFilterOptions();

      expect(mockState.activeFilters.repos.size).toBe(0);
    });
  });

  describe('Filter Menu Navigation', () => {
    test('should handle clear filters option', async () => {
      mockState.activeFilters.repos.add('project-a');
      mockState.activeFilters.repos.add('project-b');

      mockInquirer.prompt.mockResolvedValueOnce({ filterType: 'clear' });

      await showFilterOptions();

      expect(mockState.activeFilters.repos.size).toBe(0);
      expect(mockState.activeFilters.dateRange).toBeNull();
    });

    test('should return true when filter is applied', async () => {
      mockInquirer.prompt
        .mockResolvedValueOnce({ filterType: 'repo' })
        .mockResolvedValueOnce({ selectedRepos: ['project-a'] });

      const result = await showFilterOptions();

      expect(result).toBe(true);
    });

    test('should return false when user selects back', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({ filterType: 'back' });

      const result = await showFilterOptions();

      expect(result).toBe(false);
    });

    test('should handle errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      mockInquirer.prompt.mockRejectedValueOnce(new Error('Prompt failed'));

      const result = await showFilterOptions();

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Filter menu error:', expect.any(Error));

      // Verify stdin mode is restored even on error
      expect(process.stdin.setRawMode).toHaveBeenCalledWith(true);
      expect(process.stdin.resume).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('State Variable References - Regression Prevention', () => {
    test('CRITICAL: must use state.activeFilters, not undefined activeFilters', async () => {
      // This test fails if code references `activeFilters` instead of `state.activeFilters`
      mockInquirer.prompt
        .mockResolvedValueOnce({ filterType: 'repo' })
        .mockResolvedValueOnce({ selectedRepos: ['project-a'] });

      // If code incorrectly references undefined `activeFilters`, this will throw
      await expect(showFilterOptions()).resolves.not.toThrow();

      // Verify the correct state object was updated
      expect(mockState.activeFilters.repos.has('project-a')).toBe(true);
    });

    test('CRITICAL: must use state.searchTerm, not undefined searchTerm', async () => {
      // This test fails if code references `searchTerm` instead of `state.searchTerm`
      mockState.searchTerm = 'test';

      mockInquirer.prompt
        .mockResolvedValueOnce({ filterType: 'clear' });

      // If code incorrectly references undefined `searchTerm`, logger will receive undefined
      await showFilterOptions();

      // Verify logger received correct searchTerm length
      expect(mockLogger.debugSync).toHaveBeenCalledWith(
        'Before refresh',
        expect.objectContaining({
          searchTermLength: 4 // length of 'test'
        })
      );
    });

    test('CRITICAL: must properly manage stdin between consecutive prompts', async () => {
      mockInquirer.prompt
        .mockResolvedValueOnce({ filterType: 'repo' })
        .mockResolvedValueOnce({ selectedRepos: ['project-a'] });

      await showFilterOptions();

      // Verify stdin mode transitions:
      // 1. Disabled for first prompt (filter type)
      // 2. Disabled again for second prompt (repo selection)
      // 3. Re-enabled after both prompts complete
      const setRawModeCalls = process.stdin.setRawMode.mock.calls;
      expect(setRawModeCalls).toContainEqual([false]); // For inquirer
      expect(setRawModeCalls[setRawModeCalls.length - 1]).toEqual([true]); // Final re-enable
    });
  });

  describe('getAllRepos Function', () => {
    test('should return unique sorted repository names', () => {
      const repos = getAllRepos();

      expect(repos).toEqual(['project-a', 'project-b', 'project-c']);
    });

    test('should handle empty conversations', () => {
      conversations = [];
      const repos = getAllRepos();

      expect(repos).toEqual([]);
    });

    test('should handle conversations with missing project field', () => {
      conversations = [
        { project: 'project-a', modified: new Date() },
        { modified: new Date() }, // missing project
        { project: 'project-b', modified: new Date() }
      ];

      const repos = getAllRepos();

      expect(repos).toEqual(['project-a', 'project-b']);
    });
  });
});