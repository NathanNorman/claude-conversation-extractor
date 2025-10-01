import { describe, it, expect } from '@jest/globals';
import { 
  DATE_RANGES, 
  DATE_RANGE_LABELS,
  getDateRange, 
  isDateInRange,
  formatDateRange,
  formatDate,
  getRelativeTime,
  parseCustomDate,
  getDateShortcuts
} from '../src/utils/date-filters.js';

describe('Date Filter Utilities', () => {
  describe('getDateRange', () => {
    it('should return correct range for TODAY', () => {
      const range = getDateRange(DATE_RANGES.TODAY);
      expect(range).toHaveProperty('from');
      expect(range).toHaveProperty('to');
      
      const now = new Date();
      expect(range.from.toDateString()).toBe(now.toDateString());
      expect(range.to.toDateString()).toBe(now.toDateString());
      expect(range.from.getHours()).toBe(0);
      expect(range.to.getHours()).toBe(23);
    });
    
    it('should return correct range for YESTERDAY', () => {
      const range = getDateRange(DATE_RANGES.YESTERDAY);
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      expect(range.from.toDateString()).toBe(yesterday.toDateString());
      expect(range.to.toDateString()).toBe(yesterday.toDateString());
    });
    
    it('should return correct range for LAST_WEEK', () => {
      const range = getDateRange(DATE_RANGES.LAST_WEEK);
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      
      expect(range.from.toDateString()).toBe(weekAgo.toDateString());
      expect(range.to.toDateString()).toBe(new Date().toDateString());
    });
    
    it('should handle CUSTOM range with valid dates', () => {
      const customRange = {
        from: new Date('2024-01-01'),
        to: new Date('2024-12-31')
      };
      
      const range = getDateRange(DATE_RANGES.CUSTOM, customRange);
      // Just verify that we get a valid date range back
      expect(range).toHaveProperty('from');
      expect(range).toHaveProperty('to');
      expect(range.from instanceof Date).toBe(true);
      expect(range.to instanceof Date).toBe(true);
      // Verify the range makes sense (to is after from)
      expect(range.to.getTime()).toBeGreaterThan(range.from.getTime());
    });
    
    it('should throw error for CUSTOM range without dates', () => {
      expect(() => getDateRange(DATE_RANGES.CUSTOM)).toThrow('Custom range requires from and to dates');
    });
  });
  
  describe('isDateInRange', () => {
    it('should correctly identify dates within range', () => {
      const today = new Date();
      const todayRange = getDateRange(DATE_RANGES.TODAY);
      
      expect(isDateInRange(today, todayRange)).toBe(true);
      expect(isDateInRange(new Date(Date.now() - 24*60*60*1000), todayRange)).toBe(false);
    });
    
    it('should return true when no range provided', () => {
      expect(isDateInRange(new Date(), null)).toBe(true);
      expect(isDateInRange(new Date(), {})).toBe(true);
    });
    
    it('should handle edge cases at range boundaries', () => {
      const range = {
        from: new Date('2024-01-01T00:00:00'),
        to: new Date('2024-01-31T23:59:59')
      };
      
      expect(isDateInRange(new Date('2024-01-01T00:00:00'), range)).toBe(true);
      expect(isDateInRange(new Date('2024-01-31T23:59:59'), range)).toBe(true);
      expect(isDateInRange(new Date('2024-02-01T00:00:00'), range)).toBe(false);
    });
  });
  
  describe('parseCustomDate', () => {
    it('should parse various date formats', () => {
      const testCases = [
        { input: '2024-12-25', month: 11, day: 25, year: 2024 },
        { input: '12/25/2024', month: 11, day: 25, year: 2024 },
        { input: '12-25-2024', month: 11, day: 25, year: 2024 },
        { input: 'Dec 25, 2024', month: 11, day: 25, year: 2024 },
        { input: '1/1/2025', month: 0, day: 1, year: 2025 }
      ];
      
      testCases.forEach(({ input, month, day, year }) => {
        const parsed = parseCustomDate(input);
        expect(parsed).not.toBeNull();
        expect(parsed.getFullYear()).toBe(year);
        expect(parsed.getMonth()).toBe(month);
        expect(parsed.getDate()).toBe(day);
      });
    });
    
    it('should return null for invalid dates', () => {
      expect(parseCustomDate('not a date')).toBeNull();
      expect(parseCustomDate('')).toBeNull();
      expect(parseCustomDate(null)).toBeNull();
    });
  });
  
  describe('formatDate', () => {
    it('should format today as "Today"', () => {
      const formatted = formatDate(new Date(), false);
      expect(formatted).toBe('Today');
    });
    
    it('should format yesterday as "Yesterday"', () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const formatted = formatDate(yesterday, false);
      expect(formatted).toBe('Yesterday');
    });
    
    it('should include time when requested', () => {
      const date = new Date();
      const formatted = formatDate(date, true);
      expect(formatted).toMatch(/Today \d{1,2}:\d{2} [AP]M/);
    });
  });
  
  describe('formatDateRange', () => {
    it('should format predefined ranges correctly', () => {
      const formatted = formatDateRange(DATE_RANGES.TODAY);
      expect(formatted).toBe('Today');
    });
    
    it('should format custom range with dates', () => {
      const customRange = {
        from: new Date('2024-01-01'),
        to: new Date('2024-12-31')
      };
      const formatted = formatDateRange(DATE_RANGES.CUSTOM, customRange);
      // Check that it contains both dates in some format
      expect(formatted).toContain('2024');
      expect(formatted).toContain('-'); // Date separator
    });
  });
  
  describe('getDateShortcuts', () => {
    it('should return array of date shortcuts', () => {
      const shortcuts = getDateShortcuts();
      expect(Array.isArray(shortcuts)).toBe(true);
      expect(shortcuts.length).toBeGreaterThan(0);
      
      shortcuts.forEach(shortcut => {
        expect(shortcut).toHaveProperty('name');
        expect(shortcut).toHaveProperty('value');
        expect(shortcut.value).toMatch(/\d{4}-\d{2}-\d{2}/);
      });
    });
  });
  
  describe('DATE_RANGE_LABELS', () => {
    it('should have labels for all date ranges', () => {
      Object.values(DATE_RANGES).forEach(range => {
        expect(DATE_RANGE_LABELS[range]).toBeDefined();
        expect(typeof DATE_RANGE_LABELS[range]).toBe('string');
      });
    });
  });
});

describe('Date Filter Integration', () => {
  it('should filter conversations by date correctly', () => {
    const now = new Date();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    
    const testConversations = [
      { name: 'today-conv', modified: now, path: '/test1.jsonl' },
      { name: 'yesterday-conv', modified: yesterday, path: '/test2.jsonl' },
      { name: 'week-old-conv', modified: weekAgo, path: '/test3.jsonl' },
      { name: 'month-old-conv', modified: monthAgo, path: '/test4.jsonl' },
      { name: 'year-old-conv', modified: yearAgo, path: '/test5.jsonl' }
    ];
    
    // Test TODAY filter
    const todayRange = getDateRange(DATE_RANGES.TODAY);
    const todayFiltered = testConversations.filter(conv => 
      isDateInRange(conv.modified, todayRange)
    );
    expect(todayFiltered).toHaveLength(1);
    expect(todayFiltered[0].name).toBe('today-conv');
    
    // Test YESTERDAY filter
    const yesterdayRange = getDateRange(DATE_RANGES.YESTERDAY);
    const yesterdayFiltered = testConversations.filter(conv => 
      isDateInRange(conv.modified, yesterdayRange)
    );
    expect(yesterdayFiltered).toHaveLength(1);
    expect(yesterdayFiltered[0].name).toBe('yesterday-conv');
    
    // Test LAST_WEEK filter
    const lastWeekRange = getDateRange(DATE_RANGES.LAST_WEEK);
    const lastWeekFiltered = testConversations.filter(conv => 
      isDateInRange(conv.modified, lastWeekRange)
    );
    expect(lastWeekFiltered).toHaveLength(3);
    expect(lastWeekFiltered.map(c => c.name)).toContain('today-conv');
    expect(lastWeekFiltered.map(c => c.name)).toContain('yesterday-conv');
    expect(lastWeekFiltered.map(c => c.name)).toContain('week-old-conv');
    
    // Test LAST_MONTH filter
    const lastMonthRange = getDateRange(DATE_RANGES.LAST_MONTH);
    const lastMonthFiltered = testConversations.filter(conv => 
      isDateInRange(conv.modified, lastMonthRange)
    );
    expect(lastMonthFiltered).toHaveLength(4);
    expect(lastMonthFiltered.map(c => c.name)).not.toContain('year-old-conv');
    
    // Test THIS_YEAR filter
    const thisYearRange = getDateRange(DATE_RANGES.THIS_YEAR);
    const thisYearFiltered = testConversations.filter(conv => 
      isDateInRange(conv.modified, thisYearRange)
    );
    // Should include all except the year-old conversation (if it's in a different year)
    expect(thisYearFiltered.length).toBeGreaterThanOrEqual(4);
  });
});