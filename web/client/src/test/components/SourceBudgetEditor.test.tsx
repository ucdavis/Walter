import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { SourceBudgetEditor } from '@/components/projections/SourceBudgetEditor.tsx';
import { SALARY_CATEGORY, SUPPLIES_CATEGORY } from '@/lib/piProjection.ts';

afterEach(cleanup);
function open() {
  const onSet = vi.fn(),
    onErrorChange = vi.fn(),
    onReset = vi.fn();
  render(
    <SourceBudgetEditor
      initialPlanned={false}
      onErrorChange={onErrorChange}
      onReset={onReset}
      onSet={onSet}
      rows={[
        {
          category: SALARY_CATEGORY,
          initial: 1000,
          remaining: 500,
          revised: 1000,
        },
        {
          category: SUPPLIES_CATEGORY,
          initial: 100,
          remaining: 100,
          revised: 100,
        },
      ]}
    />
  );
  return { onErrorChange, onReset, onSet, user: userEvent.setup() };
}
it('starts with the project total equal to its categories', () => {
  const { onErrorChange } = open();
  expect(screen.getByLabelText('Project total')).toHaveValue('1100.00');
  expect(screen.getByLabelText(`Budget for ${SALARY_CATEGORY}`)).toHaveValue(
    '1000.00'
  );
  expect(onErrorChange).toHaveBeenLastCalledWith(null);
});
it('reports a project total that differs from the category budgets', async () => {
  const { onErrorChange, user } = open();
  const total = screen.getByLabelText('Project total');
  await user.clear(total);
  await user.type(total, '1500');
  expect(onErrorChange).toHaveBeenLastCalledWith(
    'Categories add up to $1,100, $400 under the project total.'
  );
});
it('sets category amounts, rejects sub-cent input, and keeps the categories fixed', async () => {
  const { onErrorChange, onReset, onSet, user } = open();
  const supplies = screen.getByLabelText(`Budget for ${SUPPLIES_CATEGORY}`);
  await user.clear(supplies);
  await user.type(supplies, '1.125');
  expect(onSet).toHaveBeenLastCalledWith(SUPPLIES_CATEGORY, 1.12);
  expect(onErrorChange).toHaveBeenLastCalledWith(
    'Enter amounts with at most two decimal places.'
  );
  expect(screen.queryByLabelText('Add category')).not.toBeInTheDocument();
  await user.click(
    screen.getByRole('button', { name: 'Reset budget changes' })
  );
  expect(onReset).toHaveBeenCalledOnce();
});
