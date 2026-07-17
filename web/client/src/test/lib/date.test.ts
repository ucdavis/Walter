import { describe, expect, it } from 'vitest';
import {
  formatDate,
  getLocalDateOnly,
  getProjectMonth,
  parseProjectDate,
} from '@/lib/date.ts';

describe('formatDate', () => {
  it('formats date as MM.DD.YYYY', () => {
    expect(formatDate('2025-01-15')).toBe('01.15.2025');
    expect(formatDate('2024-12-01')).toBe('12.01.2024');
  });

  it('returns custom fallback when value is null', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(null, 'No end date')).toBe('No end date');
    expect(formatDate(null, 'Not provided')).toBe('Not provided');
  });

  it('returns fallback for invalid calendar dates', () => {
    expect(formatDate('2025-02-31', 'Not provided')).toBe('Not provided');
  });
});

describe('parseProjectDate', () => {
  it('parses ISO date-only values as local calendar dates', () => {
    const date = parseProjectDate('2025-01-15');

    expect(date?.getFullYear()).toBe(2025);
    expect(date?.getMonth()).toBe(0);
    expect(date?.getDate()).toBe(15);
  });

  it('rejects invalid calendar dates', () => {
    expect(parseProjectDate('2025-02-31')).toBeNull();
    expect(parseProjectDate('not-a-date')).toBeNull();
  });

  it('rejects malformed suffixes after ISO calendar dates', () => {
    expect(parseProjectDate('2025-01-15-invalid')).toBeNull();
  });
});

describe('getLocalDateOnly', () => {
  it('normalizes a date to local midnight', () => {
    const date = getLocalDateOnly(new Date(2025, 0, 15, 14, 30, 45));

    expect(date.getFullYear()).toBe(2025);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(15);
    expect(date.getHours()).toBe(0);
    expect(date.getMinutes()).toBe(0);
    expect(date.getSeconds()).toBe(0);
  });
});

describe('getProjectMonth', () => {
  it('gets project months from valid date values', () => {
    expect(getProjectMonth('2025-01-15')).toBe('2025-01');
    expect(getProjectMonth('2025-12-31T00:00:00')).toBe('2025-12');
  });

  it('returns null for missing or invalid date values', () => {
    expect(getProjectMonth(null)).toBeNull();
    expect(getProjectMonth('2025-02-31')).toBeNull();
  });
});
