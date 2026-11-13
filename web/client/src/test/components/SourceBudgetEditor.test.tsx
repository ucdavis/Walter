import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { SourceBudgetEditor } from '@/components/projections/SourceBudgetEditor.tsx';
import {
  FRINGE_CATEGORY,
  SALARY_CATEGORY,
  SUPPLIES_CATEGORY,
} from '@/lib/piProjection.ts';

afterEach(cleanup);
function open() {
  const onMove = vi.fn(),
    onAdjust = vi.fn(),
    onPendingChange = vi.fn(),
    onReset = vi.fn();
  render(
    <SourceBudgetEditor
      categories={[SALARY_CATEGORY, FRINGE_CATEGORY, SUPPLIES_CATEGORY]}
      initialPlanned={false}
      onAdjust={onAdjust}
      onMove={onMove}
      onPendingChange={onPendingChange}
      onReset={onReset}
      rows={[
        {
          category: SALARY_CATEGORY,
          change: 0,
          initial: 1000,
          remaining: 500,
          revised: 1000,
        },
        {
          category: SUPPLIES_CATEGORY,
          change: 0,
          initial: 100,
          remaining: 100,
          revised: 100,
        },
      ]}
    />
  );
  return {
    onAdjust,
    onMove,
    onPendingChange,
    onReset,
    user: userEvent.setup(),
  };
}
it('warns about a negative donor without blocking the balanced move', async () => {
  const { onMove, onPendingChange, user } = open();
  await user.click(screen.getByRole('button', { name: 'Move budget' }));
  await user.selectOptions(
    screen.getByLabelText('From category'),
    SUPPLIES_CATEGORY
  );
  await user.selectOptions(
    screen.getByLabelText('To category'),
    SALARY_CATEGORY
  );
  await user.type(screen.getByLabelText('Amount'), '300');
  expect(screen.getByText(/\$100.00 → -\$200.00/)).toHaveTextContent(
    'This move leaves the donor category negative.'
  );
  await user.click(screen.getByRole('button', { name: 'Move amount' }));
  expect(onMove).toHaveBeenCalledWith(SUPPLIES_CATEGORY, SALARY_CATEGORY, 300);
  expect(onPendingChange).toHaveBeenLastCalledWith(false);
});
it('allows explicitly adding an absent category with zero and cancels partial input', async () => {
  const { onAdjust, onPendingChange, user } = open();
  await user.click(screen.getByRole('button', { name: 'Adjust funding' }));
  await user.selectOptions(screen.getByLabelText('Category'), FRINGE_CATEGORY);
  await user.type(screen.getByLabelText('Amount'), '0');
  await user.click(screen.getByRole('button', { name: 'Apply adjustment' }));
  expect(onAdjust).toHaveBeenCalledWith(FRINGE_CATEGORY, 0);
  await user.click(screen.getByRole('button', { name: 'Adjust funding' }));
  await user.type(screen.getByLabelText('Amount'), '-');
  expect(onPendingChange).toHaveBeenLastCalledWith(true);
  expect(
    screen.getByRole('button', { name: 'Apply adjustment' })
  ).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Cancel adjustment' }));
  expect(onAdjust).toHaveBeenCalledTimes(1);
  expect(onPendingChange).toHaveBeenLastCalledWith(false);
});
it('keeps funding adjustment distinct from a budget move', async () => {
  const { onAdjust, onMove, onReset, user } = open();
  await user.click(screen.getByRole('button', { name: 'Adjust funding' }));
  await user.selectOptions(screen.getByLabelText('Category'), SALARY_CATEGORY);
  await user.selectOptions(screen.getByLabelText('Change'), 'subtract');
  await user.type(screen.getByLabelText('Amount'), '500');
  await user.click(screen.getByRole('button', { name: 'Apply adjustment' }));
  expect(onAdjust).toHaveBeenCalledWith(SALARY_CATEGORY, -500);
  expect(onMove).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole('button', { name: 'Reset budget changes' })
  );
  expect(onReset).toHaveBeenCalledOnce();
});

it('keeps a sub-cent adjustment pending until corrected', async () => {
  const { onAdjust, user } = open();
  await user.click(screen.getByRole('button', { name: 'Adjust funding' }));
  await user.selectOptions(screen.getByLabelText('Category'), SALARY_CATEGORY);
  await user.type(screen.getByLabelText('Amount'), '1.125');
  expect(screen.getByRole('alert')).toHaveTextContent(
    'at most two decimal places'
  );
  expect(
    screen.getByRole('button', { name: 'Apply adjustment' })
  ).toBeDisabled();
  expect(onAdjust).not.toHaveBeenCalled();
  await user.clear(screen.getByLabelText('Amount'));
  await user.type(screen.getByLabelText('Amount'), '1.12');
  await user.click(screen.getByRole('button', { name: 'Apply adjustment' }));
  expect(onAdjust).toHaveBeenCalledWith(SALARY_CATEGORY, 1.12);
});
