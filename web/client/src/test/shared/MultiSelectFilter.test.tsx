import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MultiSelectFilter } from '@/shared/MultiSelectFilter.tsx';

const options = [
  { label: 'Agricultural Sciences', value: 'AG' },
  { label: 'Plant Sciences', value: 'PL' },
];
afterEach(cleanup);

describe('MultiSelectFilter accessibility', () => {
  it.each(['{Enter}', ' '])(
    'opens with %s, selects an option, and returns focus on Escape',
    async (key) => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <MultiSelectFilter
          label="Financial Department"
          onChange={onChange}
          options={options}
          selected={[]}
        />
      );
      const trigger = screen.getByRole('combobox', {
        name: 'Financial Department',
      });
      await user.tab();
      expect(trigger).toHaveFocus();
      await user.keyboard(key);
      const search = await screen.findByRole('combobox', {
        name: 'Search Financial Department',
      });
      await waitFor(() => expect(search).toHaveFocus());
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(
        screen.getByRole('dialog', { name: 'Financial Department options' })
      ).toBeInTheDocument();
      await user.type(search, 'Plant');
      await user.keyboard('{ArrowDown}{Enter}');
      expect(onChange).toHaveBeenCalledWith(['PL']);
      await user.keyboard('{Escape}');
      await waitFor(() => expect(trigger).toHaveFocus());
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    }
  );

  it('skips disabled filters during keyboard navigation and prevents opening', async () => {
    const user = userEvent.setup();
    render(
      <>
        <MultiSelectFilter
          disabled
          label="Fund"
          onChange={vi.fn()}
          options={options}
          selected={[]}
        />
        <button type="button">Next field</button>
      </>
    );
    await user.tab();
    expect(screen.getByRole('button', { name: 'Next field' })).toHaveFocus();
    await user.click(screen.getByRole('combobox', { name: 'Fund' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('removes a selected value by keyboard without opening the dropdown', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MultiSelectFilter
        label="Financial Department"
        onChange={onChange}
        options={options}
        selected={['AG']}
      />
    );
    await user.tab();
    await user.tab();
    expect(
      screen.getByRole('button', { name: 'Remove Agricultural Sciences' })
    ).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith([]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
