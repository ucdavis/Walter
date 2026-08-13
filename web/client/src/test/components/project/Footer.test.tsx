import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import Footer from '@/components/project/Footer.tsx';

afterEach(() => {
  cleanup();
  document.documentElement.dataset.theme = 'walter';
  localStorage.clear();
});

describe('Footer theme toggle', () => {
  it('switches themes and persists each explicit choice', async () => {
    const user = userEvent.setup();
    document.documentElement.dataset.theme = 'walter';

    render(<Footer />);

    await user.click(
      screen.getByRole('button', { name: 'Switch to dark mode' })
    );

    expect(document.documentElement).toHaveAttribute(
      'data-theme',
      'walter-dark'
    );
    expect(localStorage.getItem('walter-color-theme')).toBe('dark');

    await user.click(
      screen.getByRole('button', { name: 'Switch to light mode' })
    );

    expect(document.documentElement).toHaveAttribute('data-theme', 'walter');
    expect(localStorage.getItem('walter-color-theme')).toBe('light');
  });

  it('reflects a dark theme restored before React renders', () => {
    document.documentElement.dataset.theme = 'walter-dark';

    render(<Footer />);

    expect(
      screen.getByRole('button', { name: 'Switch to light mode' })
    ).toBeInTheDocument();
  });
});
