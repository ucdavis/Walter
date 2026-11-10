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
import { createSalaryExample } from '@/test/fixtures/projections.ts';
import { createProjectionWorkspaceHarness } from '@/test/helpers/projectionWorkspace.tsx';

import {
  EQUIPMENT_CATEGORY,
  FEE_REMISSION_CATEGORY,
  FRINGE_CATEGORY,
  SALARY_CATEGORY,
  SUPPLIES_CATEGORY as supplies,
} from '@/lib/piProjection.ts';
const travel = '06 - Travel';
let workspace: ReturnType<typeof createProjectionWorkspaceHarness>;
const read = () => workspace.read();
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
  plan.content.fundingSources[0].runRates = [
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
function openWorkspace(
  plan = expensePlan(),
  browser = false,
  search = '?section=expenses&source=1'
) {
  if (browser) {
    window.history.replaceState(null, '', `/projections/TEST-PI/1${search}`);
  }
  const history = browser
    ? createBrowserHistory()
    : createMemoryHistory({
        initialEntries: [`/projections/TEST-PI/1${search}`],
      });
  histories.push(history);
  workspace = createProjectionWorkspaceHarness({ history, plan });
  const { router } = workspace;
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
function expectSummary(label: string, amount: string) {
  expect(screen.getByText(label).nextElementSibling).toHaveTextContent(amount);
}
function month(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('other expenses planning controls', () => {
  it('uses captured history with stable categories, preserves an unchanged precise amount, and applies history only on Apply', async () => {
    const plan = expensePlan();
    const { user } = openWorkspace(plan);
    await screen.findByText('No costs captured in this window');
    await user.click(
      screen.getByRole('button', {
        name: `Edit historical amount for ${supplies}`,
      })
    );
    expect(screen.getByLabelText('Monthly amount')).toHaveValue('310.12');
    await user.click(screen.getByRole('button', { name: 'Apply amount' }));
    expect(read().revision).toBe(0);
    expect(
      read().draft.content.fundingSources[0].historicalExpenseOverrides
    ).toEqual([]);
    await user.click(
      screen.getByRole('button', { name: 'Change history window' })
    );
    await user.selectOptions(screen.getByLabelText('Averaging window'), '6');
    expect(read().pendingEditor).toMatchObject({
      hasChanges: true,
      kind: 'history',
    });
    expect(read().draft.content.historyMonths).toBe(3);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(read().draft.content.historyMonths).toBe(3);
    await changeWindow(user, '6');
    expect(read().draft.content.historyMonths).toBe(6);
    expect(screen.getByText('6-month average: $600.00')).toBeInTheDocument();
    expect(screen.getByText('6-month average: $200.00')).toBeInTheDocument();
    expect(read().draft.content.fundingSources).toEqual(
      plan.content.fundingSources
    );
    expect(read().draft.content.appointments).toEqual(
      plan.content.appointments
    );
  });

  it('retains signed custom amounts through history changes and restores the selected window amount', async () => {
    const { user } = openWorkspace();
    await user.click(
      await screen.findByRole('button', {
        name: `Edit historical amount for ${supplies}`,
      })
    );
    await enter(user, 'Monthly amount', '-20');
    expectSummary('Historical forecast', '$1,850.74');
    expect(read().pendingEditor).toMatchObject({
      expenditureCategory: supplies,
      fundingSourceId: 1,
      hasChanges: true,
      kind: 'historicalExpense',
    });
    await user.click(screen.getByRole('button', { name: 'Apply amount' }));
    expectSummary('Historical forecast', '-$119.35');
    expectSummary('Total other expenses', '-$119.35');
    await changeWindow(user, '6');
    expect(
      read().draft.content.fundingSources[0].historicalExpenseOverrides
    ).toEqual([{ amount: -20, expenditureCategory: supplies }]);
    await user.click(
      screen.getByRole('button', {
        name: `Use historical amount for ${supplies}`,
      })
    );
    expect(
      read().draft.content.fundingSources[0].historicalExpenseOverrides
    ).toEqual([]);
    const row = screen.getByText('6-month average: $600.00').closest('tr')!;
    expect(within(row).getByText('$600.00')).toBeInTheDocument();
    expect(
      within(row).queryByRole('button', { name: /Remove/ })
    ).not.toBeInTheDocument();
  });

  it('explicitly turns a missing zero baseline off across history windows and can cancel that intent', async () => {
    const { user } = openWorkspace();
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
    expect(
      read().draft.content.fundingSources[0].historicalExpenseOverrides
    ).toEqual([]);
    await user.click(
      screen.getByRole('button', {
        name: `Edit historical amount for ${travel}`,
      })
    );
    await user.click(screen.getByRole('button', { name: 'Turn off estimate' }));
    await user.click(screen.getByRole('button', { name: 'Apply amount' }));
    await changeWindow(user, '6');
    expect(
      read().draft.content.fundingSources[0].historicalExpenseOverrides
    ).toEqual([{ amount: 0, expenditureCategory: travel }]);
    expect(screen.getByText('Custom · Off')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', {
        name: `Use historical amount for ${travel}`,
      })
    );
    expect(
      read().draft.content.fundingSources[0].historicalExpenseOverrides
    ).toEqual([]);
  });

  it('turns a sub-cent custom amount off even when its rounded input already says zero', async () => {
    const plan = expensePlan();
    plan.content.fundingSources[0].historicalExpenseOverrides = [
      { amount: 0.004, expenditureCategory: supplies },
    ];
    const { user } = openWorkspace(plan);
    await user.click(
      await screen.findByRole('button', {
        name: `Edit historical amount for ${supplies}`,
      })
    );
    expect(screen.getByLabelText('Monthly amount')).toHaveValue('0.00');
    await user.click(screen.getByRole('button', { name: 'Apply amount' }));
    expect(
      read().draft.content.fundingSources[0].historicalExpenseOverrides[0]
        .amount
    ).toBe(0.004);
    await user.click(
      screen.getByRole('button', {
        name: `Edit historical amount for ${supplies}`,
      })
    );
    await user.click(screen.getByRole('button', { name: 'Turn off estimate' }));
    await user.click(screen.getByRole('button', { name: 'Apply amount' }));
    expect(
      read().draft.content.fundingSources[0].historicalExpenseOverrides[0]
        .amount
    ).toBe(0);
  });

  it('requires blank name/category/amount, defaults dates, shows prorated forecast total, and saves manual expenses separately from captured costs', async () => {
    const plan = expensePlan();
    plan.content.fundingSources[0].capturedAt = '2026-01-16T00:00:00Z';
    plan.content.fundingSources[0].endDate = '2026-01-31';
    const { user } = openWorkspace(plan);
    await user.click(
      await screen.findByRole('button', { name: 'Add expense' })
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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
    expect(read().draft.content.fundingSources[0].expenses).toEqual([
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
    expect(read().draft.content.fundingSources[0].actuals).toEqual(
      plan.content.fundingSources[0].actuals
    );
    expect(read().draft.content.fundingSources[0].runRates).toEqual(
      plan.content.fundingSources[0].runRates
    );
    const added = screen.getByRole('region', { name: 'Added expenses' });
    expect(within(added).getByText('$150.00')).toBeInTheDocument();
    expect(
      workspace.server.read().stored!.content.fundingSources[0].expenses
    ).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Save plan' }));
    await screen.findByRole('button', { name: '✓ Saved' });
    expect(
      workspace.server.read().stored!.content.fundingSources[0].expenses
    ).toEqual(read().draft.content.fundingSources[0].expenses);
  });

  it('waits for amount interaction before showing validation and clears it for valid credits and zero', async () => {
    const { user } = openWorkspace();
    await user.click(
      await screen.findByRole('button', { name: 'Add expense' })
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Expense name'), 'Travel credit');
    await user.selectOptions(screen.getByLabelText('Category'), supplies);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('Monthly amount'));
    await user.tab();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter an amount');
    await enter(user, 'Monthly amount', '1.234');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'up to two decimal places'
    );
    expect(
      screen.getByRole('button', { name: 'Apply expense' })
    ).toBeDisabled();
    await enter(user, 'Monthly amount', '-12.50');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply expense' })).toBeEnabled();
    await enter(user, 'Monthly amount', '0');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply expense' })).toBeEnabled();
  });

  it('shows validation on an invalid form submission without adding an expense', async () => {
    const { user } = openWorkspace();
    await user.click(
      await screen.findByRole('button', { name: 'Add expense' })
    );
    fireEvent.submit(screen.getByLabelText('Expense name').closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter an amount'
    );
    expect(read().draft.content.fundingSources[0].expenses).toEqual([]);
    expect(
      screen.getByRole('button', { name: 'Apply expense' })
    ).toBeDisabled();
  });

  it('allows a signed one-time credit without end fields and removes it without a second confirmation', async () => {
    const { user } = openWorkspace();
    await addManual(user, 'Refund', '-500');
    await user.selectOptions(screen.getByLabelText('Frequency'), 'OneTime');
    expect(screen.queryByLabelText('End condition')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('End month')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Expense month')).toHaveValue('2026-01');
    expect(screen.getByText('Forecast total: -$500.00')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Apply expense' }));
    expect(read().draft.content.fundingSources[0].expenses[0]).toMatchObject({
      amount: -500,
      endMonth: null,
      kind: 'OneTime',
    });
    expectSummary('Added expense forecast', '-$500.00');
    expectSummary('Total other expenses', '$1,350.74');
    await user.click(
      screen.getByRole('button', { name: 'Remove expense Refund' })
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(read().draft.content.fundingSources[0].expenses).toEqual([]);
  });

  it('allows dates outside the forecast with an explanation and never calls a zero amount a date problem', async () => {
    const { user } = openWorkspace();
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
    plan.content.fundingSources[0].endDate = null;
    plan.content.fundingSources[0].expenses = [
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
    const { user } = openWorkspace(plan);
    await user.click(
      await screen.findByRole('button', { name: 'Edit expense Fixed estimate' })
    );
    expect(screen.getByLabelText('Monthly amount')).toHaveValue('123.46');
    expect(screen.getByLabelText('End condition')).toHaveValue('fixed');
    expect(screen.getByLabelText('End month')).toHaveValue('2026-05');
    await user.click(screen.getByRole('button', { name: 'Apply expense' }));
    expect(read().draft.content.fundingSources[0].expenses).toEqual(
      plan.content.fundingSources[0].expenses
    );
    expect(read().revision).toBe(0);
    await user.click(screen.getByRole('button', { name: 'Add expense' }));
    expect(
      screen.getByText(/Through forecast end: Dec 2026/)
    ).toBeInTheDocument();
    expect(screen.getByLabelText('End condition')).toHaveValue('source');
  });

  it('keeps every source available after the first expense and scopes history and added expenses to the selected source', async () => {
    const plan = expensePlan();
    plan.content.fundingSources[1].name = 'Renamed analysis';
    plan.content.fundingSources[1].projectName = 'Captured coastal project';
    plan.content.fundingSources[1].projectNumber = 'P-EXPENSES';
    plan.content.fundingSources[1].taskNumber = '02';
    plan.content.fundingSources[1].taskName = 'Analysis';
    plan.content.fundingSources[1].runRates = [
      { expenditureCategory: supplies, historyMonths: 3, monthlyAmount: 900 },
    ];
    const { user } = openWorkspace(plan);
    const selector = await screen.findByLabelText('View expenses for');
    const sourceOptions = () =>
      within(screen.getByLabelText('View expenses for'))
        .getAllByRole('option')
        .map((option) => ({
          text: option.textContent,
          value: option.getAttribute('value'),
        }));
    const initialOptions = sourceOptions();
    expectSummary('Historical forecast', '$1,850.74');
    expectSummary('Added expense forecast', '$0.00');
    expect(screen.getByText('3-month average: $310.12')).toBeInTheDocument();
    await user.selectOptions(selector, '2');
    expect(screen.getByLabelText('View expenses for')).toHaveValue('2');
    expectSummary('Historical forecast', '$5,370.97');
    expect(screen.getByText('3-month average: $900.00')).toBeInTheDocument();
    expect(
      screen.queryByText('3-month average: $310.12')
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /Historical estimates and added expenses below belong to this source/
      )
    ).toBeInTheDocument();
    await addManual(user, 'Second source purchase', '25');
    const expenseDialog = screen.getByRole('dialog', { name: 'Add expense' });
    expect(expenseDialog).toHaveTextContent(
      'Charge to: Renamed analysis · Task 02 · Analysis'
    );
    expect(expenseDialog).toHaveTextContent(
      'Captured coastal project · Project P-EXPENSES'
    );
    await user.click(screen.getByRole('button', { name: 'Apply expense' }));
    expectSummary('Added expense forecast', '$149.19');
    expectSummary('Total other expenses', '$5,520.16');
    expect(sourceOptions()).toEqual(initialOptions);
    expect(screen.getByLabelText('View expenses for')).toHaveValue('2');
    expect(read().draft.content.fundingSources[0].expenses).toEqual([]);
    expect(read().draft.content.fundingSources[1].expenses).toMatchObject([
      { amount: 25, description: 'Second source purchase' },
    ]);
    await user.selectOptions(screen.getByLabelText('View expenses for'), '1');
    expectSummary('Added expense forecast', '$0.00');
    expectSummary('Total other expenses', '$1,850.74');
    expect(screen.getByText('3-month average: $310.12')).toBeInTheDocument();
    expect(
      screen.getByText('No added expenses for this source.')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Second source purchase')
    ).not.toBeInTheDocument();
    expect(sourceOptions()).toEqual(initialOptions);
    await user.selectOptions(screen.getByLabelText('View expenses for'), '2');
    expect(screen.getByText('Second source purchase')).toBeInTheDocument();
    expect(screen.getByText('3-month average: $900.00')).toBeInTheDocument();
  });

  it('guards unapplied typing on departure and resets its source target on browser Back', async () => {
    const { history, user } = openWorkspace(expensePlan(), true);
    await screen.findByLabelText('View expenses for');
    await user.selectOptions(screen.getByLabelText('View expenses for'), '2');
    await addManual(user, 'Project B supplies', '20');
    expect(read().pendingEditor).toMatchObject({
      fundingSourceId: 2,
      hasChanges: true,
    });
    act(() => {
      void workspace.router.navigate({ to: '/projections/TEST-PI' });
    });
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
    expect(screen.getByLabelText('View expenses for')).toHaveValue('1');
    expect(
      read().draft.content.fundingSources.every(
        (source) => source.expenses.length === 0
      )
    ).toBe(true);
    await act(async () => {
      history.forward();
    });
    await waitFor(() =>
      expect(screen.getByLabelText('View expenses for')).toHaveValue('2')
    );
    expect(read().pendingEditor).toBeNull();
  });
});
