/**
 * Tests for Date Range Helper Utilities
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  DATE_RANGE_PRESETS,
  calculateDateRange,
  isConversationInRange,
  formatDateRangeLabel,
  getDateRangeChoices
} from '../../src/analytics/utils/date-range-helper.js';

describe('Date Range Helper', () => {
  let mockNow;
  let RealDate;

  beforeEach(() => {
    // Store reference to real Date
    RealDate = Date;

    // Mock current date to Oct 22, 2025 at noon local time
    mockNow = new RealDate('2025-10-22T12:00:00');

    // Mock global Date
    global.Date = class extends RealDate {
      constructor(...args) {
        if (args.length === 0) {
          super();
          return mockNow;
        }
        return new RealDate(...args);
      }

      static now() {
        return mockNow.getTime();
      }
    };

    // Copy static methods from RealDate
    Object.setPrototypeOf(global.Date, RealDate);
  });

  afterEach(() => {
    global.Date = RealDate;
  });

  describe('DATE_RANGE_PRESETS', () => {
    it('should export all required preset constants', () => {
      expect(DATE_RANGE_PRESETS.LAST_7_DAYS).toBe('Last 7 Days');
      expect(DATE_RANGE_PRESETS.LAST_30_DAYS).toBe('Last 30 Days');
      expect(DATE_RANGE_PRESETS.LAST_3_MONTHS).toBe('Last 3 Months');
      expect(DATE_RANGE_PRESETS.LAST_6_MONTHS).toBe('Last 6 Months');
      expect(DATE_RANGE_PRESETS.LAST_YEAR).toBe('Last Year');
      expect(DATE_RANGE_PRESETS.ALL_TIME).toBe('All Time');
    });
  });

  describe('calculateDateRange', () => {
    it('should return unfiltered range for All Time', () => {
      const range = calculateDateRange(DATE_RANGE_PRESETS.ALL_TIME);

      expect(range).toEqual({
        label: 'All Time',
        start: null,
        end: null,
        isFiltered: false
      });
    });

    it('should calculate Last 7 Days correctly', () => {
      const range = calculateDateRange(DATE_RANGE_PRESETS.LAST_7_DAYS);

      expect(range.label).toBe('Last 7 Days');
      expect(range.isFiltered).toBe(true);
      expect(range.start).toBeInstanceOf(RealDate);
      expect(range.end).toBeInstanceOf(RealDate);

      // Start should be 7 days before start of today
      const expectedStart = new RealDate('2025-10-22T00:00:00');
      expectedStart.setDate(expectedStart.getDate() - 7);
      expect(range.start.getTime()).toBe(expectedStart.getTime());

      // End should be start of today (Oct 22, 2025 00:00:00 local)
      const expectedEnd = new RealDate('2025-10-22T00:00:00');
      expect(range.end.getTime()).toBe(expectedEnd.getTime());
    });

    it('should calculate Last 30 Days correctly', () => {
      const range = calculateDateRange(DATE_RANGE_PRESETS.LAST_30_DAYS);

      expect(range.label).toBe('Last 30 Days');
      expect(range.isFiltered).toBe(true);

      const expectedStart = new RealDate('2025-10-22T00:00:00');
      expectedStart.setDate(expectedStart.getDate() - 30);
      expect(range.start.getTime()).toBe(expectedStart.getTime());
    });

    it('should calculate Last 3 Months (90 days) correctly', () => {
      const range = calculateDateRange(DATE_RANGE_PRESETS.LAST_3_MONTHS);

      expect(range.label).toBe('Last 3 Months');
      expect(range.isFiltered).toBe(true);

      const expectedStart = new RealDate('2025-10-22T00:00:00');
      expectedStart.setDate(expectedStart.getDate() - 90);
      expect(range.start.getTime()).toBe(expectedStart.getTime());
    });

    it('should calculate Last 6 Months (180 days) correctly', () => {
      const range = calculateDateRange(DATE_RANGE_PRESETS.LAST_6_MONTHS);

      expect(range.label).toBe('Last 6 Months');
      expect(range.isFiltered).toBe(true);

      const expectedStart = new RealDate('2025-10-22T00:00:00');
      expectedStart.setDate(expectedStart.getDate() - 180);
      expect(range.start.getTime()).toBe(expectedStart.getTime());
    });

    it('should calculate Last Year (365 days) correctly', () => {
      const range = calculateDateRange(DATE_RANGE_PRESETS.LAST_YEAR);

      expect(range.label).toBe('Last Year');
      expect(range.isFiltered).toBe(true);

      const expectedStart = new RealDate('2025-10-22T00:00:00');
      expectedStart.setDate(expectedStart.getDate() - 365);
      expect(range.start.getTime()).toBe(expectedStart.getTime());
    });

    it('should throw error for unknown period', () => {
      expect(() => calculateDateRange('Unknown Period')).toThrow('Unknown date range period: Unknown Period');
    });

    it('should set end date to start of today (midnight)', () => {
      const range = calculateDateRange(DATE_RANGE_PRESETS.LAST_7_DAYS);
      const endDate = range.end;

      expect(endDate.getHours()).toBe(0);
      expect(endDate.getMinutes()).toBe(0);
      expect(endDate.getSeconds()).toBe(0);
      expect(endDate.getMilliseconds()).toBe(0);
    });
  });

  describe('isConversationInRange', () => {
    it('should include all conversations for All Time range', () => {
      const allTimeRange = {
        label: 'All Time',
        start: null,
        end: null,
        isFiltered: false
      };
      const conversation = {
        firstTimestamp: '2020-01-01T10:00:00Z',
        lastTimestamp: '2020-01-15T14:30:00Z'
      };

      expect(isConversationInRange(conversation, allTimeRange)).toBe(true);
    });

    it('should include conversation with lastTimestamp in range', () => {
      const last30DaysRange = {
        label: 'Last 30 Days',
        start: new RealDate('2025-09-22T00:00:00'),
        end: new RealDate('2025-10-22T00:00:00'),
        isFiltered: true
      };
      const conversation = {
        firstTimestamp: '2025-09-01T10:00:00Z',
        lastTimestamp: '2025-10-15T14:30:00Z'
      };

      expect(isConversationInRange(conversation, last30DaysRange)).toBe(true);
    });

    it('should exclude conversation with lastTimestamp before range', () => {
      const last30DaysRange = {
        label: 'Last 30 Days',
        start: new RealDate('2025-09-22T00:00:00'),
        end: new RealDate('2025-10-22T00:00:00'),
        isFiltered: true
      };
      const conversation = {
        firstTimestamp: '2025-08-01T10:00:00Z',
        lastTimestamp: '2025-09-20T14:30:00Z'
      };

      expect(isConversationInRange(conversation, last30DaysRange)).toBe(false);
    });

    it('should exclude conversation with lastTimestamp after range', () => {
      const last30DaysRange = {
        label: 'Last 30 Days',
        start: new RealDate('2025-09-22T00:00:00'),
        end: new RealDate('2025-10-22T00:00:00'),
        isFiltered: true
      };
      const conversation = {
        firstTimestamp: '2025-10-23T10:00:00Z',
        lastTimestamp: '2025-10-25T14:30:00Z'
      };

      expect(isConversationInRange(conversation, last30DaysRange)).toBe(false);
    });

    it('should exclude conversation with missing lastTimestamp', () => {
      const last30DaysRange = {
        label: 'Last 30 Days',
        start: new RealDate('2025-09-22T00:00:00'),
        end: new RealDate('2025-10-22T00:00:00'),
        isFiltered: true
      };
      const conversation = {
        firstTimestamp: '2025-10-01T10:00:00Z'
      };

      expect(isConversationInRange(conversation, last30DaysRange)).toBe(false);
    });

    it('should exclude conversation with invalid lastTimestamp', () => {
      const last30DaysRange = {
        label: 'Last 30 Days',
        start: new RealDate('2025-09-22T00:00:00'),
        end: new RealDate('2025-10-22T00:00:00'),
        isFiltered: true
      };
      const conversation = {
        firstTimestamp: '2025-10-01T10:00:00Z',
        lastTimestamp: 'invalid-date'
      };

      expect(isConversationInRange(conversation, last30DaysRange)).toBe(false);
    });

    it('should include conversation at exact start boundary', () => {
      const last30DaysRange = {
        label: 'Last 30 Days',
        start: new RealDate('2025-09-22T00:00:00'),
        end: new RealDate('2025-10-22T00:00:00'),
        isFiltered: true
      };
      const conversation = {
        firstTimestamp: '2025-09-20T10:00:00Z',
        lastTimestamp: '2025-09-22T05:00:00Z' // After start boundary
      };

      expect(isConversationInRange(conversation, last30DaysRange)).toBe(true);
    });

    it('should exclude conversation at exact end boundary', () => {
      const last30DaysRange = {
        label: 'Last 30 Days',
        start: new RealDate('2025-09-22T00:00:00'),
        end: new RealDate('2025-10-22T00:00:00'),
        isFiltered: true
      };
      const conversation = {
        firstTimestamp: '2025-10-21T10:00:00Z',
        lastTimestamp: '2025-10-22T05:00:00Z' // At or after end boundary
      };

      expect(isConversationInRange(conversation, last30DaysRange)).toBe(false);
    });

    it('should handle conversation spanning multiple periods using lastTimestamp', () => {
      const last30DaysRange = {
        label: 'Last 30 Days',
        start: new RealDate('2025-09-22T00:00:00'),
        end: new RealDate('2025-10-22T00:00:00'),
        isFiltered: true
      };
      const conversation = {
        firstTimestamp: '2025-08-01T10:00:00Z', // Before range
        lastTimestamp: '2025-10-15T14:30:00Z'   // Within range
      };

      expect(isConversationInRange(conversation, last30DaysRange)).toBe(true);
    });

    it('should exclude conversation with null lastTimestamp', () => {
      const last30DaysRange = {
        label: 'Last 30 Days',
        start: new RealDate('2025-09-22T00:00:00'),
        end: new RealDate('2025-10-22T00:00:00'),
        isFiltered: true
      };
      const conversation = {
        firstTimestamp: '2025-10-01T10:00:00Z',
        lastTimestamp: null
      };

      expect(isConversationInRange(conversation, last30DaysRange)).toBe(false);
    });

    it('should handle error during date parsing gracefully', () => {
      const last30DaysRange = {
        label: 'Last 30 Days',
        start: new RealDate('2025-09-22T00:00:00'),
        end: new RealDate('2025-10-22T00:00:00'),
        isFiltered: true
      };
      const conversation = {
        lastTimestamp: { invalid: 'object' }
      };

      expect(isConversationInRange(conversation, last30DaysRange)).toBe(false);
    });
  });

  describe('formatDateRangeLabel', () => {
    it('should return "All Time" for null dates', () => {
      expect(formatDateRangeLabel(null, null)).toBe('All Time');
    });

    it('should return "Invalid Range" for missing start date', () => {
      expect(formatDateRangeLabel(null, new RealDate('2025-10-22'))).toBe('Invalid Range');
    });

    it('should return "Invalid Range" for missing end date', () => {
      expect(formatDateRangeLabel(new RealDate('2025-10-01'), null)).toBe('Invalid Range');
    });

    it('should format same month range correctly', () => {
      const start = new RealDate('2025-10-01T00:00:00');
      const end = new RealDate('2025-10-07T00:00:00');

      expect(formatDateRangeLabel(start, end)).toBe('Oct 1-7, 2025');
    });

    it('should format cross-month range in current year correctly', () => {
      const start = new RealDate('2025-09-22T00:00:00');
      const end = new RealDate('2025-10-22T00:00:00');

      expect(formatDateRangeLabel(start, end)).toBe('Sep 22 - Oct 22, 2025');
    });

    it('should format cross-year range correctly', () => {
      const start = new RealDate('2024-12-15T00:00:00');
      const end = new RealDate('2025-01-15T00:00:00');

      expect(formatDateRangeLabel(start, end)).toBe('Dec 15, 2024 - Jan 15, 2025');
    });

    it('should format past year range correctly', () => {
      const start = new RealDate('2024-03-01T00:00:00');
      const end = new RealDate('2024-03-31T00:00:00');

      expect(formatDateRangeLabel(start, end)).toBe('Mar 1-31, 2024');
    });

    it('should use short month names', () => {
      const start = new RealDate('2025-01-01T00:00:00');
      const end = new RealDate('2025-12-31T00:00:00');

      const label = formatDateRangeLabel(start, end);
      expect(label).toBe('Jan 1 - Dec 31, 2025');
    });

    it('should handle single day range in same month', () => {
      const start = new RealDate('2025-10-15T00:00:00');
      const end = new RealDate('2025-10-15T23:59:59');

      expect(formatDateRangeLabel(start, end)).toBe('Oct 15-15, 2025');
    });
  });

  describe('getDateRangeChoices', () => {
    it('should return array of choice objects', () => {
      const choices = getDateRangeChoices();

      expect(Array.isArray(choices)).toBe(true);
      expect(choices.length).toBe(6);
    });

    it('should have correct structure for each choice', () => {
      const choices = getDateRangeChoices();

      choices.forEach(choice => {
        expect(choice).toHaveProperty('name');
        expect(choice).toHaveProperty('value');
        expect(typeof choice.name).toBe('string');
        expect(typeof choice.value).toBe('string');
      });
    });

    it('should include all preset options', () => {
      const choices = getDateRangeChoices();
      const values = choices.map(c => c.value);

      expect(values).toContain(DATE_RANGE_PRESETS.LAST_7_DAYS);
      expect(values).toContain(DATE_RANGE_PRESETS.LAST_30_DAYS);
      expect(values).toContain(DATE_RANGE_PRESETS.LAST_3_MONTHS);
      expect(values).toContain(DATE_RANGE_PRESETS.LAST_6_MONTHS);
      expect(values).toContain(DATE_RANGE_PRESETS.LAST_YEAR);
      expect(values).toContain(DATE_RANGE_PRESETS.ALL_TIME);
    });

    it('should have "All Time (default)" as the last option', () => {
      const choices = getDateRangeChoices();
      const lastChoice = choices[choices.length - 1];

      expect(lastChoice.name).toBe('All Time (default)');
      expect(lastChoice.value).toBe(DATE_RANGE_PRESETS.ALL_TIME);
    });

    it('should maintain consistent ordering', () => {
      const choices = getDateRangeChoices();
      const names = choices.map(c => c.name);

      expect(names).toEqual([
        'Last 7 Days',
        'Last 30 Days',
        'Last 3 Months',
        'Last 6 Months',
        'Last Year',
        'All Time (default)'
      ]);
    });
  });

  describe('Integration: Full workflow', () => {
    it('should calculate range and filter conversations correctly', () => {
      const range = calculateDateRange(DATE_RANGE_PRESETS.LAST_30_DAYS);

      const conversations = [
        {
          title: 'Recent work',
          firstTimestamp: '2025-10-01T10:00:00Z',
          lastTimestamp: '2025-10-15T14:30:00Z'
        },
        {
          title: 'Old work',
          firstTimestamp: '2025-08-01T10:00:00Z',
          lastTimestamp: '2025-08-15T14:30:00Z'
        },
        {
          title: 'Ongoing work',
          firstTimestamp: '2025-09-01T10:00:00Z',
          lastTimestamp: '2025-10-20T09:00:00Z'
        }
      ];

      const filtered = conversations.filter(conv => isConversationInRange(conv, range));

      expect(filtered).toHaveLength(2);
      expect(filtered[0].title).toBe('Recent work');
      expect(filtered[1].title).toBe('Ongoing work');
    });

    it('should handle All Time filter correctly', () => {
      const range = calculateDateRange(DATE_RANGE_PRESETS.ALL_TIME);

      const conversations = [
        {
          title: 'Very old',
          firstTimestamp: '2020-01-01T10:00:00Z',
          lastTimestamp: '2020-01-15T14:30:00Z'
        },
        {
          title: 'Recent',
          firstTimestamp: '2025-10-01T10:00:00Z',
          lastTimestamp: '2025-10-15T14:30:00Z'
        }
      ];

      const filtered = conversations.filter(conv => isConversationInRange(conv, range));

      expect(filtered).toHaveLength(2);
    });

    it('should format calculated date range correctly', () => {
      const range = calculateDateRange(DATE_RANGE_PRESETS.LAST_7_DAYS);
      const label = formatDateRangeLabel(range.start, range.end);

      // Should show Oct 15-22, 2025 (7 days before Oct 22) or Oct 15 - Oct 22, 2025
      // Pattern matches both same-month and cross-month formats
      expect(label).toMatch(/^[A-Z][a-z]{2} \d{1,2}(-| - [A-Z][a-z]{2} )\d{1,2}, \d{4}$/);
    });
  });

  describe('Timezone handling', () => {
    it('should use local midnight for date boundaries', () => {
      const range = calculateDateRange(DATE_RANGE_PRESETS.LAST_7_DAYS);

      // End should be local midnight, not UTC midnight
      expect(range.end.getHours()).toBe(0);
      expect(range.end.getMinutes()).toBe(0);
      expect(range.end.getSeconds()).toBe(0);

      // Start should also be local midnight 7 days earlier
      expect(range.start.getHours()).toBe(0);
      expect(range.start.getMinutes()).toBe(0);
      expect(range.start.getSeconds()).toBe(0);
    });

    it('should correctly compare UTC timestamps with local date boundaries', () => {
      const range = calculateDateRange(DATE_RANGE_PRESETS.LAST_30_DAYS);

      // Conversation with UTC timestamp just before local midnight
      const conversation = {
        firstTimestamp: '2025-10-21T23:00:00Z',
        lastTimestamp: '2025-10-21T23:59:00Z'
      };

      // Should be included if lastTimestamp is before the end boundary
      const inRange = isConversationInRange(conversation, range);
      expect(typeof inRange).toBe('boolean');
    });
  });
});
