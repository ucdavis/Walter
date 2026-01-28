import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const openMock = vi.fn();

vi.mock('@/components/search/CommandPaletteProvider.tsx', () => ({
  useCommandPalette: () => ({
    close: vi.fn(),
    open: openMock,
    toggle: vi.fn(),
  }),
}));

import { SearchButton } from '@/components/search/SearchButton.tsx';

describe('SearchButton', () => {
  it('renders placeholder and triggers open on click', async () => {
    const user = userEvent.setup();

    render(<SearchButton placeholder="Search things…" />);

    const button = screen.getByRole('button', { name: /Search things…/i });
    await user.click(button);

    expect(openMock).toHaveBeenCalledTimes(1);
  });

  it('hides shortcut hint when showShortcut is false', () => {
    const { container } = render(
      <SearchButton placeholder="Search…" showShortcut={false} />
    );

    const button = screen.getByRole('button', { name: /Search…/i });
    expect(button.querySelectorAll('kbd')).toHaveLength(0);
    expect(container.querySelectorAll('kbd')).toHaveLength(0);
  });
});
