import { describe, expect, it } from 'vitest';
import {
  formatDate,
  getLocalDateOnly,
  getProjectMonth,
  isAwardExpired,
  isPlanningDate,
  parseProjectDate,
} from '@/lib/date.ts';

describe('isPlanningDate', () => {
  it.each(['0001-01-01', '9999-12-31', '2000-02-29', '2028-02-29'])(
    'accepts the valid calendar date %s',
    (value) => expect(isPlanningDate(value)).toBe(true)
  );

  it.each([
    '0000-01-01',
    '10000-01-01',
    '1900-02-29',
    '2026-02-29',
    '2026-04-31',
    '2026-00-01',
    '2026-13-01',
    '2026-01-00',
    '2026-1-01',
    '2026-01-1',
    '2026-01-01T00:00:00Z',
    ' 2026-01-01',
    '',
  ])('rejects %s as a planning date', (value) =>
    expect(isPlanningDate(value)).toBe(false)
  );
});

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

describe('isAwardExpired', () => {
  it('is true when the award end date is before today', () => {
    expect(isAwardExpired('2000-01-01')).toBe(true);
  });

  it('is false for today-or-later or missing award end dates', () => {
    expect(isAwardExpired('2099-12-31')).toBe(false);
    expect(isAwardExpired(null)).toBe(false);
  });
});
