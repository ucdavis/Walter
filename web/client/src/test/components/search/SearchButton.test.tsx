import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { User } from '@/queries/user.ts';

const openMock = vi.fn();
const defaultUser: User = {
  email: 'user@example.com',
  employeeId: '12345',
  id: '1',
  kerberos: 'user',
  name: 'Test User',
  roles: [],
};
let mockUser: User = defaultUser;

vi.mock('@/components/search/CommandPaletteProvider.tsx', () => ({
  useCommandPalette: () => ({
    close: vi.fn(),
    open: openMock,
    toggle: vi.fn(),
  }),
}));

vi.mock('@/shared/auth/UserContext.tsx', () => ({
  useUser: () => mockUser,
}));

import { SearchButton } from '@/components/search/SearchButton.tsx';

describe('SearchButton', () => {
  it('uses the financial search placeholder for users who can view financials', () => {
    mockUser = { ...defaultUser, roles: ['FinancialViewer'] };

    render(<SearchButton />);

    expect(
      screen.getByRole('button', {
        name: /Search projects, people, reports\.\.\./i,
      })
    ).toBeInTheDocument();
  });

  it('uses the non-financial placeholder for users without financial access', () => {
    mockUser = { ...defaultUser, roles: ['PrincipalInvestigator'] };

    render(<SearchButton />);

    expect(
      screen.getByRole('button', {
        name: /Search projects and reports\.\.\./i,
      })
    ).toBeInTheDocument();
  });

  it('renders placeholder and triggers open on click', async () => {
    const user = userEvent.setup();
    mockUser = defaultUser;

    render(<SearchButton placeholder="Search things…" />);

    const button = screen.getByRole('button', { name: /Search things…/i });
    await user.click(button);

    expect(openMock).toHaveBeenCalledTimes(1);
  });

  it('hides shortcut hint when showShortcut is false', () => {
    mockUser = defaultUser;

    const { container } = render(
      <SearchButton placeholder="Search…" showShortcut={false} />
    );

    const button = screen.getByRole('button', { name: /Search…/i });
    expect(button.querySelectorAll('kbd')).toHaveLength(0);
    expect(container.querySelectorAll('kbd')).toHaveLength(0);
  });
});
