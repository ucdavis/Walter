import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/queries/user.ts';

const defaultUser: User = {
  email: 'user@example.com',
  employeeId: '12345',
  iamId: '1000012345',
  id: '1',
  isEmulating: false,
  kerberos: 'user',
  name: 'Test User',
  roles: [],
};
let mockUser = defaultUser;

vi.mock('@/shared/auth/UserContext.tsx', () => ({
  useUser: () => mockUser,
}));

import {
  getInitials,
  isLocalLoopbackHost,
  UserAvatar,
} from '@/components/project/UserAvatar.tsx';

afterEach(cleanup);

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

describe('UserAvatar', () => {
  beforeEach(() => {
    mockUser = defaultUser;
  });

  it('shows the profile photo with one styled tooltip', async () => {
    const user = userEvent.setup();
    const { container } = render(createElement(UserAvatar));

    expect(screen.getByRole('img', { name: 'User avatar' })).toHaveAttribute(
      'src',
      '/api/user/me/photo'
    );
    const tooltipTrigger = container.querySelector<HTMLElement>(
      '[data-tooltip-placement="bottom"]'
    );
    expect(tooltipTrigger).not.toHaveAttribute('title');

    await user.hover(tooltipTrigger!);

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Test User');
  });

  it('replaces the profile photo with an emulation icon', () => {
    mockUser = { ...defaultUser, isEmulating: true };

    render(createElement(UserAvatar));

    expect(
      screen.getByRole('img', { name: 'Emulating Test User' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: 'User avatar' })
    ).not.toBeInTheDocument();
  });
});
