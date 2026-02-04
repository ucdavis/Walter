import { describe, expect, it } from 'vitest';
import { getInitials } from '@/components/project/header.tsx';

describe('getInitials', () => {
  it('uses first + last name for multi-part names', () => {
    expect(getInitials('Scott Richard Kirkland')).toBe('SK');
  });

  it('handles comma-separated directory format', () => {
    expect(getInitials('Kirkland, Scott Richard')).toBe('SK');
  });

  it('handles single-token names', () => {
    expect(getInitials('postit')).toBe('PO');
  });

  it('handles empty names', () => {
    expect(getInitials('')).toBe('?');
  });
});

