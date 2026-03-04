import { describe, expect, it } from 'vitest';
import { getInitials, isLocalLoopbackHost } from '@/components/project/UserAvatar.tsx';

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

describe('isLocalLoopbackHost', () => {
  it('returns true for local loopback hosts', () => {
    expect(isLocalLoopbackHost('localhost')).toBe(true);
    expect(isLocalLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLocalLoopbackHost('::1')).toBe(true);
    expect(isLocalLoopbackHost('[::1]')).toBe(true);
    expect(isLocalLoopbackHost('dev.localhost')).toBe(true);
  });

  it('returns false for non-loopback hosts', () => {
    expect(isLocalLoopbackHost('example.com')).toBe(false);
    expect(isLocalLoopbackHost('192.168.1.10')).toBe(false);
  });
});
