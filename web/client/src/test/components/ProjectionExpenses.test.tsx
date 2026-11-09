import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import {
  createBrowserHistory,
  createMemoryHistory,
  RouterProvider,
} from '@tanstack/react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { createSalaryExample } from '@/dev/projections/fixture.ts';
import { createProjectionPreviewRouter } from '@/dev/projections/router.tsx';

import {
  EQUIPMENT_CATEGORY,
  FEE_REMISSION_CATEGORY,
  FRINGE_CATEGORY,
  SALARY_CATEGORY,
  SUPPLIES_CATEGORY as supplies,
} from '@/lib/piProjection.ts';
const travel = '06 - Travel';
const read = () => window.walterProjectionPreview!.read();
const histories: ReturnType<typeof createMemoryHistory>[] = [];
afterEach(() => {
  cleanup();
  for (const history of histories) {
    history.destroy();
  }
  histories.length = 0;
  window.history.replaceState(null, '', '/');
});
function expensePlan() {
  const plan = createSalaryExample();
  plan.fundingSources[0].runRates = [
    {
      expenditureCategory: supplies,
      historyMonths: 3,
      monthlyAmount: 310.123_456,
    },
    { expenditureCategory: supplies, historyMonths: 6, monthlyAmount: 600 },
    { expenditureCategory: travel, historyMonths: 6, monthlyAmount: 200 },
  ];
  return plan;
}
function preview(
  plan = expensePlan(),
  browser = false,
  search = '?section=expenses&source=1'
) {
  if (browser) {
    window.history.replaceState(null, '', `/projections-preview.html${search}`);
  }
  const history = browser
    ? createBrowserHistory()
    : createMemoryHistory({
        initialEntries: [`/projections-preview.html${search}`],
      });
  histories.push(history);
  const router = createProjectionPreviewRouter({ history, plan });
  render(<RouterProvider router={router} />);
  return { history, router, user: userEvent.setup() };
}
async function enter(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  value: string
) {
  await user.clear(screen.getByLabelText(label));
  if (value) {
    await user.type(screen.getByLabelText(label), value);
  }
}
async function changeWindow(
  user: ReturnType<typeof userEvent.setup>,
  months: string
) {
  await user.click(
    screen.getByRole('button', { name: 'Change history window' })
  );
  await user.selectOptions(screen.getByLabelText('Averaging window'), months);
  await user.click(
    screen.getByRole('button', { name: 'Apply history window' })
  );
}
async function addManual(
  user: ReturnType<typeof userEvent.setup>,
  name = 'Supplies order',
  amount = '310'
) {
  await user.click(await screen.findByRole('button', { name: 'Add expense' }));
  await user.type(screen.getByLabelText('Expense name'), name);
  await user.selectOptions(screen.getByLabelText('Category'), supplies);
  await user.type(screen.getByLabelText('Monthly amount'), amount);
}
function month(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('other expenses planning controls', () => {
  it('uses captured history with stable categories, preserves an unchanged precise amount, and applies history only on Apply', async () => {
    const plan = expensePlan();
    const { user } = preview(plan);
    await screen.findByText('No costs captured in this window');
    await user.click(
      screen.getByRole('button', {
        name: `Edit historical amount for ${supplies}`,
      })
    );
    expect(screen.getByLabelText('Monthly amount')).toHaveValue('310.12');
    await user.click(screen.getByRole('button', { name: 'Apply amount' }));
    expect(read().revision).toBe(0);
    expect(read().draft.fundingSources[0].historicalExpenseOverrides).toEqual(
      []
    );
    await user.click(
      screen.getByRole('button', { name: 'Change history window' })
    );
    await user.selectOptions(screen.getByLabelText('Averaging window'), '6');
    expect(read().pendingEditor).toMatchObject({
      hasChanges: true,
      kind: 'history',
    });
    expect(read().draft.historyMonths).toBe(3);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(read().draft.historyMonths).toBe(3);
    await changeWindow(user, '6');
    expect(read().draft.historyMonths).toBe(6);
    expect(screen.getByText('6-month average: $600.00')).toBeInTheDocument();
    expect(screen.getByText('6-month average: $200.00')).toBeInTheDocument();
    expect(read().draft.fundingSources).toEqual(plan.fundingSources);
    expect(read().draft.appointments).toEqual(plan.appointments);
  });

  it('retains signed custom amounts through history changes and restores the selected window amount', async () => {
    const { user } = preview();
    await user.click(
      await screen.findByRole('button', {
        name: `Edit historical amount for ${supplies}`,
      })
    );
    await enter(user, 'Monthly amount', '-20');
    expect(read().pendingEditor).toMatchObject({
      expenditureCategory: supplies,
      fundingSourceId: 1,
      hasChanges: true,
      kind: 'historicalExpense',
    });
    await user.click(screen.getByRole('button', { name: 'Apply amount' }));
    await changeWindow(user, '6');
    expect(read().draft.fundingSources[0].historicalExpenseOverrides).toEqual([
      { amount: -20, expenditureCategory: supplies },
    ]);
    await user.click(
      screen.getByRole('button', {
        name: `Use historical amount for ${supplies}`,
      })
    );
    expect(read().draft.fundingSources[0].historicalExpenseOverrides).toEqual(
      []
    );
    const row = screen.getByText('6-month average: $600.00').closest('tr')!;
    expect(within(row).getByText('$600.00')).toBeInTheDocument();
    expect(
      within(row).queryByRole('button', { name: /Remove/ })
    ).not.toBeInTheDocument();
  });

  it('explicitly turns a missing zero baseline off across history windows and can cancel that intent', async () => {
    const { user } = preview();
    await user.click(
      await screen.findByRole('button', {
        name: `Edit historical amount for ${travel}`,
      })
    );
    expect(
      screen.getByText(
        /No costs captured in this window. The historical amount/
      )
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Turn off estimate' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(read().draft.fundingSources[0].historicalExpenseOverrides).toEqual(
      []
    );
    await user.click(
      screen.getByRole('button', {
        name: `Edit historical amount for ${travel}`,
      })
    );
    await user.click(screen.getByRole('button', { name: 'Turn off estimate' }));
    await user.click(screen.getByRole('button', { name: 'Apply amount' }));
    await changeWindow(user, '6');
    expect(read().draft.fundingSources[0].historicalExpenseOverrides).toEqual([
      { amount: 0, expenditureCategory: travel },
    ]);
    expect(screen.getByText('Custom · Off')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', {
        name: `Use historical amount for ${travel}`,
      })
    );
    expect(read().draft.fundingSources[0].historicalExpenseOverrides).toEqual(
      []
    );
  });

  it('turns a sub-cent custom amount off even when its rounded input already says zero', async () => {
    const plan = expensePlan();
    plan.fundingSources[0].historicalExpenseOverrides = [
      { amount: 0.004, expenditureCategory: supplies },
    ];
    const { user } = preview(plan);
    await user.click(
      await screen.findByRole('button', {
        name: `Edit historical amount for ${supplies}`,
      })
    );
    expect(screen.getByLabelText('Monthly amount')).toHaveValue('0.00');
    await user.click(screen.getByRole('button', { name: 'Apply amount' }));
    expect(
      read().draft.fundingSources[0].historicalExpenseOverrides[0].amount
    ).toBe(0.004);
    await user.click(
      screen.getByRole('button', {
        name: `Edit historical amount for ${supplies}`,
      })
    );
    await user.click(screen.getByRole('button', { name: 'Turn off estimate' }));
    await user.click(screen.getByRole('button', { name: 'Apply amount' }));
    expect(
      read().draft.fundingSources[0].historicalExpenseOverrides[0].amount
    ).toBe(0);
  });

  it('requires blank name/category/amount, defaults dates, shows prorated forecast total, and saves manual expenses separately from captured costs', async () => {
    const plan = expensePlan();
    plan.fundingSources[0].capturedAt = '2026-01-16T00:00:00Z';
    plan.fundingSources[0].endDate = '2026-01-31';
    const { user } = preview(plan);
    await user.click(
      await screen.findByRole('button', { name: 'Add expense' })
    );
    expect(screen.getByLabelText('Expense name')).toHaveValue('');
    expect(screen.getByLabelText('Category')).toHaveValue('');
    expect(screen.getByLabelText('Monthly amount')).toHaveValue('');
    expect(screen.getByLabelText('Start month')).toHaveValue('2026-01');
    expect(screen.getByLabelText('Frequency')).toHaveValue('Monthly');
    expect(screen.getByLabelText('End condition')).toHaveValue('source');
    expect(
      screen.getByRole('button', { name: 'Apply expense' })
    ).toBeDisabled();
    const choices = within(screen.getByLabelText('Category'))
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(choices).not.toContain(SALARY_CATEGORY);
    expect(choices).not.toContain(FRINGE_CATEGORY);
    expect(choices).toContain(EQUIPMENT_CATEGORY);
    expect(choices).toContain(FEE_REMISSION_CATEGORY);
    await user.type(screen.getByLabelText('Expense name'), 'Supplies order');
    await user.selectOptions(screen.getByLabelText('Category'), supplies);
    await user.type(screen.getByLabelText('Monthly amount'), '310');
    expect(screen.getByText('Forecast total: $150.00')).toBeInTheDocument();
    expect(read().pendingEditor).toMatchObject({
      expenseId: null,
      fundingSourceId: 1,
      hasChanges: true,
      kind: 'expense',
    });
    await user.click(screen.getByRole('button', { name: 'Apply expense' }));
    expect(read().draft.fundingSources[0].expenses).toEqual([
      {
        amount: 310,
        description: 'Supplies order',
        endMonth: null,
        expenditureCategory: supplies,
        id: 1,
        kind: 'Monthly',
        startMonth: '2026-01-01',
      },
    ]);
    expect(read().draft.fundingSources[0].actuals).toEqual(
      plan.fundingSources[0].actuals
    );
    expect(read().draft.fundingSources[0].runRates).toEqual(
      plan.fundingSources[0].runRates
    );
    const added = screen.getByRole('region', { name: 'Added expenses' });
    expect(within(added).getByText('$150.00')).toBeInTheDocument();
    expect(
      window.walterProjectionPreview!.server.read().stored!.fundingSources[0]
        .expenses
    ).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Save plan' }));
    await screen.findByRole('button', { name: '✓ Saved' });
    expect(
      window.walterProjectionPreview!.server.read().stored!.fundingSources[0]
        .expenses
    ).toEqual(read().draft.fundingSources[0].expenses);
  });

  it('allows a signed one-time credit without end fields and removes it without a second confirmation', async () => {
    const { user } = preview();
    await addManual(user, 'Refund', '-500');
    await user.selectOptions(screen.getByLabelText('Frequency'), 'OneTime');
    expect(screen.queryByLabelText('End condition')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('End month')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Expense month')).toHaveValue('2026-01');
    expect(screen.getByText('Forecast total: -$500.00')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Apply expense' }));
    expect(read().draft.fundingSources[0].expenses[0]).toMatchObject({
      amount: -500,
      endMonth: null,
      kind: 'OneTime',
    });
    await user.click(
      screen.getByRole('button', { name: 'Remove expense Refund' })
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(read().draft.fundingSources[0].expenses).toEqual([]);
  });

  it('allows dates outside the forecast with an explanation and never calls a zero amount a date problem', async () => {
    const { user } = preview();
    await addManual(user, 'Later purchase', '25');
    month('Start month', '2028-01');
    expect(screen.getByText(/These dates fall outside/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply expense' })).toBeEnabled();
    await enter(user, 'Monthly amount', '0');
    expect(
      screen.queryByText(/These dates fall outside/)
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Apply expense' }));
    expect(
      screen.queryByText('No eligible dates in the forecast period.')
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Edit expense Later purchase' })
    );
    await enter(user, 'Monthly amount', '25');
    await user.click(screen.getByRole('button', { name: 'Apply expense' }));
    expect(
      screen.getByText('No eligible dates in the forecast period.')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save plan' }));
    await screen.findByRole('button', { name: '✓ Saved' });
  });

  it('shows a resolved open forecast end and preserves explicit end dates and precise amounts on unchanged edits', async () => {
    const plan = expensePlan();
    plan.fundingSources[0].endDate = null;
    plan.fundingSources[0].expenses = [
      {
        amount: 123.456_789,
        description: 'Fixed estimate',
        endMonth: '2026-05-01',
        expenditureCategory: supplies,
        id: 4,
        kind: 'Monthly',
        startMonth: '2026-02-01',
      },
    ];
    const { user } = preview(plan);
    await user.click(
      await screen.findByRole('button', { name: 'Edit expense Fixed estimate' })
    );
    expect(screen.getByLabelText('Monthly amount')).toHaveValue('123.46');
    expect(screen.getByLabelText('End condition')).toHaveValue('fixed');
    expect(screen.getByLabelText('End month')).toHaveValue('2026-05');
    await user.click(screen.getByRole('button', { name: 'Apply expense' }));
    expect(read().draft.fundingSources[0].expenses).toEqual(
      plan.fundingSources[0].expenses
    );
    expect(read().revision).toBe(0);
    await user.click(screen.getByRole('button', { name: 'Add expense' }));
    expect(
      screen.getByText(/Through forecast end: Jan 2027/)
    ).toBeInTheDocument();
    expect(screen.getByLabelText('End condition')).toHaveValue('source');
  });

  it('guards unapplied typing on departure and resets its source target on browser Back', async () => {
    const { history, user } = preview(expensePlan(), true);
    await screen.findByLabelText('Funding source');
    await user.selectOptions(screen.getByLabelText('Funding source'), '2');
    await addManual(user, 'Project B supplies', '20');
    expect(read().pendingEditor).toMatchObject({
      fundingSourceId: 2,
      hasChanges: true,
    });
    await user.click(screen.getByRole('button', { name: 'Leave preview' }));
    const guard = await screen.findByRole('dialog', {
      name: 'Leave this plan?',
    });
    await user.click(within(guard).getByRole('button', { name: 'Stay' }));
    expect(screen.getByLabelText('Expense name')).toHaveValue(
      'Project B supplies'
    );
    await act(async () => {
      history.back();
    });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(screen.getByLabelText('Funding source')).toHaveValue('1');
    expect(
      read().draft.fundingSources.every(
        (source) => source.expenses.length === 0
      )
    ).toBe(true);
    await act(async () => {
      history.forward();
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Funding source')).toHaveValue('2')
    );
    expect(read().pendingEditor).toBeNull();
  });
});
