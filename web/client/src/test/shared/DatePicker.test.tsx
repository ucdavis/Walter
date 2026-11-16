import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { DatePicker } from '@/shared/DatePicker.tsx';

afterEach(cleanup);

describe('DatePicker navigation', () => {
  it('jumps to a future year and month without limiting selection to the current year', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const futureYear = new Date().getFullYear() + 5;
    render(<DatePicker id="date" label="From" onChange={onChange} value="" />);

    await user.click(screen.getByLabelText('From'));
    const calendar = within(screen.getByRole('dialog'));
    const year = calendar.getByRole('spinbutton', { name: 'Calendar year' });
    await user.clear(year);
    await user.type(year, String(futureYear));
    await user.tab();
    await user.selectOptions(
      calendar.getByRole('combobox', { name: 'Calendar month' }),
      '5'
    );
    await user.click(
      calendar.getByRole('button', {
        name: new RegExp(`June 15th, ${futureYear}`),
      })
    );

    expect(onChange).toHaveBeenCalledWith(`${futureYear}-06-15`);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('preserves date limits after jumping years', async () => {
    const user = userEvent.setup();
    render(
      <DatePicker
        id="date"
        label="From"
        max="2032-06-15"
        onChange={vi.fn()}
        value=""
      />
    );

    await user.click(screen.getByLabelText('From'));
    const calendar = within(screen.getByRole('dialog'));
    const year = calendar.getByRole('spinbutton', { name: 'Calendar year' });
    await user.clear(year);
    await user.type(year, '2033');
    await user.tab();

    expect(
      calendar.getByRole('button', { name: /June 15th, 2033/ })
    ).toBeDisabled();
  });
});
