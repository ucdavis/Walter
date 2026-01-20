import { describe, expect, it } from 'vitest';
import { formatDate } from '@/lib/date.ts';

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
});