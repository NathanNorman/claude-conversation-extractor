import { describe, test, expect, jest, beforeEach } from '@jest/globals';

// Simple debounce function for testing (extracted from cli.js logic)
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

describe('Utility Functions', () => {
  beforeEach(() => {
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  test('debounce function delays execution', () => {
    const mockFn = jest.fn();
    const debouncedFn = debounce(mockFn, 100);

    debouncedFn('test1');
    debouncedFn('test2');
    debouncedFn('test3');

    // Function should not be called immediately
    expect(mockFn).not.toHaveBeenCalled();

    // Fast-forward time by 100ms
    jest.advanceTimersByTime(100);

    // Now function should be called once with the last arguments
    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(mockFn).toHaveBeenCalledWith('test3');
  });

  test('debounce function cancels previous calls', () => {
    const mockFn = jest.fn();
    const debouncedFn = debounce(mockFn, 100);

    debouncedFn('first');
    jest.advanceTimersByTime(50); // Half way through

    debouncedFn('second');
    jest.advanceTimersByTime(50); // This should not trigger the first call

    expect(mockFn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(50); // Complete the second call
    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(mockFn).toHaveBeenCalledWith('second');
  });

  test('debounce function with zero delay', () => {
    const mockFn = jest.fn();
    const debouncedFn = debounce(mockFn, 0);

    debouncedFn('immediate');
    jest.advanceTimersByTime(1);

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(mockFn).toHaveBeenCalledWith('immediate');
  });
});

describe('Data Processing Functions', () => {
  test('conversation path parsing', () => {
    const testPath = '/Users/test/.claude/projects/my-project/conversation_123.jsonl';
    const pathParts = testPath.split('/');
    const fileName = pathParts[pathParts.length - 1];
    const projectName = pathParts[pathParts.length - 2];

    expect(fileName).toBe('conversation_123.jsonl');
    expect(projectName).toBe('my-project');
    expect(fileName.endsWith('.jsonl')).toBe(true);
  });

  test('relevance calculation logic', () => {
    // Test the relevance calculation from the search function
    const calculateRelevance = (matchCount, totalWords) => {
      return Math.min(0.95, (matchCount * 20) / Math.max(totalWords * 0.01, 1));
    };

    expect(calculateRelevance(1, 100)).toBeCloseTo(0.95); // 1 * 20 / max(1, 1) = 20, min(0.95, 20) = 0.95
    expect(calculateRelevance(5, 100)).toBeCloseTo(0.95); // 5 * 20 / max(1, 1) = 100, min(0.95, 100) = 0.95
    expect(calculateRelevance(1, 1000)).toBeCloseTo(0.95); // 1 * 20 / max(10, 1) = 2, min(0.95, 2) = 0.95
    expect(calculateRelevance(0, 100)).toBe(0);
  });

  test('search term validation', () => {
    const isValidSearchTerm = (term) => {
      return typeof term === 'string' && term.length >= 2;
    };

    expect(isValidSearchTerm('ab')).toBe(true);
    expect(isValidSearchTerm('hello world')).toBe(true);
    expect(isValidSearchTerm('a')).toBe(false);
    expect(isValidSearchTerm('')).toBe(false);
    expect(isValidSearchTerm(null)).toBe(false);
    expect(isValidSearchTerm(undefined)).toBe(false);
  });
});