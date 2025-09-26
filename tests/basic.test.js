import { describe, test, expect } from '@jest/globals';

describe('Basic Test Suite', () => {
  test('Jest is working correctly', () => {
    expect(true).toBe(true);
  });

  test('Basic math operations', () => {
    expect(2 + 2).toBe(4);
    expect(5 * 3).toBe(15);
    expect(10 / 2).toBe(5);
  });

  test('String operations', () => {
    const testString = 'Hello, World!';
    expect(testString.length).toBe(13);
    expect(testString.toLowerCase()).toBe('hello, world!');
    expect(testString.includes('World')).toBe(true);
  });

  test('Array operations', () => {
    const testArray = [1, 2, 3, 4, 5];
    expect(testArray.length).toBe(5);
    expect(testArray.includes(3)).toBe(true);
    expect(testArray.slice(0, 3)).toEqual([1, 2, 3]);
  });

  test('Async operations', async () => {
    const promise = Promise.resolve('async test');
    const result = await promise;
    expect(result).toBe('async test');
  });
});

describe('Environment Tests', () => {
  test('Node.js environment is available', () => {
    expect(typeof process).toBe('object');
    expect(process.version).toBeDefined();
  });

  test('ES modules are working', () => {
    // This test itself being able to import demonstrates ES modules work
    expect(typeof describe).toBe('function');
    expect(typeof test).toBe('function');
    expect(typeof expect).toBe('function');
  });
});