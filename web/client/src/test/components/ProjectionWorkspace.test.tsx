import { createRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { projectionLookupsQueryOptions } from '@/queries/projections.ts';
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
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProjectionWorkspaceHarness } from '@/test/helpers/projectionWorkspace.tsx';
import {
  createSalaryExample,
  createBookedSalaryExample,
  createAppointmentLookupsExample,
} from '@/test/fixtures/projections.ts';
import {
  FRINGE_CATEGORY,
  SALARY_CATEGORY,
  SUPPLIES_CATEGORY,
} from '@/lib/piProjection.ts';
import { ProjectionSessionProvider } from '@/components/projections/ProjectionSession.tsx';
import {
  ProjectionWorkspace,
  type ProjectionWorkspaceHandle,
} from '@/components/projections/ProjectionWorkspace.tsx';

afterEach(cleanup);

function openWorkspace(
  search = '?section=staffing&appointment=101',
  plan = createSalaryExample()
) {
  const history = createMemoryHistory({
    initialEntries: [`/projections/TEST-PI/1${search}`],
  });
  workspace = createProjectionWorkspaceHarness({ history, plan });
  const { router } = workspace;
  render(<RouterProvider router={router} />);
  return { history, router, user: userEvent.setup() };
}

let workspace: ReturnType<typeof createProjectionWorkspaceHarness>;
const read = () => workspace.read();
const salaryInput = () =>
  screen.getByRole('textbox', { name: 'Full-time annual salary' });
const editButton = () =>
  screen.getByRole('button', { name: 'Edit appointment for Alex Example' });

describe('projection plan header', () => {
  it('reports applied salary edits, clears a reversion, and returns focus to Plan changes', async () => {
    const plan = createSalaryExample();
    plan.content.appointments[0].monthlySalary = 8000.01;
    plan.content.comparison.appointments[0].monthlySalary = 8000.01;
    const { user } = openWorkspace('?section=staffing', plan);
    const opener = await screen.findByRole('button', { name: 'Plan changes' });
    const details = screen.getByRole('button', { name: 'Edit plan details' });
    details.focus();
    fireEvent.click(opener);
    const dialog = () => screen.getByRole('dialog', { name: 'Plan changes' });
    expect(dialog()).toHaveTextContent('No staffing or funding changes');
    fireEvent(dialog(), new Event('cancel', { cancelable: true }));
    expect(opener).toHaveFocus();
    await user.click(editButton());
    await user.clear(salaryInput());
    await user.type(salaryInput(), '144000');
    expect(read().draft.content.appointments[0].monthlySalary).toBe(8000.01);
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    opener.focus();
    await user.keyboard('{Enter}');
    expect(dialog()).toHaveTextContent('Plan has unsaved edits');
    expect(dialog()).toHaveTextContent('$96,000.12 / year');
    expect(dialog()).toHaveTextContent('$144,000.00 / year');
    await user.click(
      within(dialog()).getByRole('button', { name: 'Close plan changes' })
    );
    expect(opener).toHaveFocus();

    await user.click(editButton());
    await user.clear(salaryInput());
    await user.type(salaryInput(), '96000.12');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await user.click(opener);
    expect(dialog()).toHaveTextContent(
      '0 appointments and 0 funding sources affected'
    );
    expect(dialog()).toHaveTextContent('No staffing or funding changes');
  });

  it('clears overlapping allocation changes when both original displayed shares are reapplied', async () => {
    const plan = createSalaryExample();
    const shares = Array.from({ length: 2 }, () => ({
      endDate: '2026-01-31',
      fundingSourceId: 1,
      percent: 0.123_456_789_012_34,
      startDate: '2026-01-01',
    }));
    plan.content.appointments[0].allocations = structuredClone(shares);
    plan.content.comparison.appointments[0].allocations = shares;
    const { user } = openWorkspace('?section=staffing', plan);
    const openAllocations = async () => {
      await user.click(
        await screen.findByRole('button', {
          name: /Alex Example, Jan 2026:.*Edit allocations/,
        })
      );
      return within(
        screen.getByRole('dialog', { name: 'Alex Example funding' })
      );
    };
    const applyShares = async (
      editor: ReturnType<typeof within>,
      values: string[]
    ) => {
      for (const [index, value] of values.entries()) {
        const input = editor.getByRole('textbox', {
          name: `Appointment share ${index + 1} (%)`,
        });
        await user.clear(input);
        await user.type(input, value);
      }
      await user.click(editor.getByRole('button', { name: /^Replace / }));
    };
    const openReport = async () => {
      await user.click(screen.getByRole('button', { name: 'Plan changes' }));
      return screen.getByRole('dialog', { name: 'Plan changes' });
    };

    const editor = await openAllocations();
    const originals = [1, 2].map(
      (row) =>
        editor.getByRole<HTMLInputElement>('textbox', {
          name: `Appointment share ${row} (%)`,
        }).value
    );
    await applyShares(editor, ['15', '16']);
    const changed = await openReport();
    expect(changed).toHaveTextContent(
      '1 appointment and 1 funding source affected'
    );
    await user.click(
      within(changed).getByRole('button', { name: 'Close plan changes' })
    );

    await applyShares(await openAllocations(), originals);
    expect(await openReport()).toHaveTextContent(
      'No staffing or funding changes'
    );
  });

  it('shows dates and preserves subcent pool adjustments and balances', async () => {
    const plan = createSalaryExample();
    const [pooled, dateOnly] = plan.content.fundingSources;
    pooled.budgets[0].budget = 2600;
    pooled.balanceAdjustment = 99.999 - 100;
    pooled.capturedAt = '2026-02-12T00:00:00Z';
    dateOnly.endDate = '2026-07-31';
    const { user } = openWorkspace('?section=overview', plan);
    await user.click(
      await screen.findByRole('button', { name: 'Plan changes' })
    );
    const dialog = within(screen.getByRole('dialog', { name: 'Plan changes' }));
    expect(dialog.getByText('Plan inputs captured Jan 1, 2026')).toBeVisible();
    const [first, second] = dialog
      .getAllByRole('article')
      .map((card) => within(card));
    expect(
      first.getByText('Source inputs captured Feb 12, 2026')
    ).toBeVisible();
    expect(
      first.getByRole('table', { name: 'Overall funding decreased' })
    ).toHaveTextContent('Source total$100.00-$0.001$99.999');
    expect(
      first.getByRole('table', { name: 'Funding dates' })
    ).toHaveTextContent('Funding end dateJun 30, 2026Jun 30, 2026');
    expect(
      second.getByRole('table', { name: 'Available funding' })
    ).toHaveTextContent('Source total$16,000.00$0.00$16,000.00');
    expect(
      second.getByRole('table', { name: 'Funding dates' })
    ).toHaveTextContent('Funding end dateJun 30, 2026Jul 31, 2026');
  });

  it('shows unavailable original allocations for retained and excluded appointments', async () => {
    const plan = createSalaryExample();
    const original = plan.content.comparison.appointments[0];
    original.allocations = null;
    original.monthlySalary = null;
    plan.content.comparison.appointments.push({
      ...original,
      id: 102,
      name: 'Excluded appointment',
    });
    plan.content.lastAppointmentId = 102;
    const { user } = openWorkspace('?section=overview', plan);
    await user.click(
      await screen.findByRole('button', { name: 'Plan changes' })
    );
    const dialog = within(screen.getByRole('dialog', { name: 'Plan changes' }));
    const [retained, excluded] = dialog
      .getAllByRole('article')
      .map((card) => within(card));
    expect(
      retained.getByText(
        'Original funding allocations were unavailable at capture.'
      )
    ).toBeVisible();
    await user.click(retained.getByText('Funding allocation'));
    expect(retained.getAllByText('Unavailable')).toHaveLength(2);
    expect(retained.getAllByText('50%')).toHaveLength(2);
    expect(excluded.getByText('Excluded from this plan')).toBeVisible();
    expect(
      excluded.getByText(
        'Original funding allocations were unavailable at capture.'
      )
    ).toBeVisible();
    expect(excluded.queryByText('Funding allocation')).toBeNull();
  });

  it('shows the plan save status when only notes changed', async () => {
    const { user } = openWorkspace('?section=overview');
    await user.click(
      await screen.findByRole('button', { name: 'Edit plan details' })
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Plan notes (optional)' }),
      'Review with the team'
    );
    await user.click(
      screen.getByRole('button', { name: 'Apply plan details' })
    );
    await user.click(screen.getByRole('button', { name: 'Plan changes' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Plan changes' }));
    expect(dialog.getByText('Plan has unsaved edits')).toBeVisible();
    expect(
      dialog.getByText(
        'No staffing or funding changes from the captured inputs.'
      )
    ).toBeVisible();
  });

  it('minimizes warnings beside the title across sections and restores them without changing the plan', async () => {
    const plan = createSalaryExample();
    plan.content.fundingSources[0].balanceAdjustment = -50_000;
    plan.content.notes = 'Read this only in Plan details.';
    const { user } = openWorkspace('?section=overview', plan);
    const minimize = await screen.findByRole('button', {
      name: 'Minimize funding summary',
    });
    expect(minimize).toHaveAttribute('aria-expanded', 'true');
    expect(minimize).toHaveTextContent('Minimize');
    expect(
      screen.queryByRole('region', { name: 'Plan notes' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText(plan.content.notes)).not.toBeInTheDocument();
    await user.click(minimize);
    const restore = screen.getByRole('button', {
      name: 'Show funding summary',
    });
    expect(restore).toHaveAttribute('aria-expanded', 'false');
    expect(restore).toHaveClass('text-error');
    expect(restore).toHaveFocus();
    expect(
      screen.getByRole('heading', { name: plan.name }).parentElement
    ).toContainElement(restore);
    expect(
      document.getElementById(restore.getAttribute('aria-controls')!)
    ).not.toBeVisible();
    expect(
      screen.queryByRole('region', { name: 'Funding summary' })
    ).not.toBeInTheDocument();
    const navigation = screen.getByRole('navigation', {
      name: 'Plan sections',
    });
    await user.click(
      within(navigation).getByRole('button', { name: 'Staffing' })
    );
    await user.click(
      within(navigation).getByRole('button', { name: 'Expenses' })
    );
    expect(
      screen.getByRole('button', { name: 'Show funding summary' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Funding summary' })
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Show funding summary' })
    );
    expect(
      screen.getByRole('region', { name: 'Funding summary' })
    ).toHaveTextContent('First funding shortfall: Jan 2026');
    expect(
      screen.getByRole('button', { name: 'Minimize funding summary' })
    ).toHaveFocus();
    expect(
      screen.queryByRole('button', { name: 'Show funding summary' })
    ).not.toBeInTheDocument();
    expect(read()).toMatchObject({ dirty: false, revision: 0 });
    expect(read().draft).toEqual(plan);
    expect(screen.getByRole('button', { name: 'Save plan' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Edit plan details' }));
    expect(screen.getByLabelText('Plan notes (optional)')).toHaveValue(
      plan.content.notes
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(
      screen.getByRole('button', { name: 'Minimize funding summary' })
    );
    cleanup();
    openWorkspace('?section=overview', plan);
    expect(
      await screen.findByRole('region', { name: 'Funding summary' })
    ).toBeVisible();
  });

  it.each([0.25, 0.75])(
    'uses an amber minimized warning for allocation shares of %s without a funding shortfall',
    async (percent) => {
      const plan = createSalaryExample();
      for (const source of plan.content.fundingSources) {
        source.balanceAdjustment = 100_000;
      }
      for (const allocation of plan.content.appointments[0].allocations) {
        allocation.percent = percent;
      }
      const { user } = openWorkspace('?section=overview', plan);
      await user.click(
        await screen.findByRole('button', { name: 'Minimize funding summary' })
      );
      expect(
        screen.getByRole('button', { name: 'Show funding summary' })
      ).toHaveClass('text-warning');
      await user.click(
        screen.getByRole('button', { name: 'Show funding summary' })
      );
      await user.click(
        within(
          screen.getByRole('region', { name: 'Funding summary' })
        ).getByRole('button', { name: 'Review staffing' })
      );
      expect(read().location.section).toBe('staffing');
    }
  );

  it('shows no funding toggle when the plan has no warnings', async () => {
    openWorkspace('?section=overview');
    await screen.findByRole('heading', { name: 'Salary planning example' });
    expect(
      screen.queryByRole('region', { name: 'Funding summary' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Minimize funding summary' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Show funding summary' })
    ).not.toBeInTheDocument();
  });

  it('keeps one actionable funding warning above the title across section navigation', async () => {
    const plan = createSalaryExample();
    plan.content.fundingSources[0].balanceAdjustment = -50_000;
    const { user } = openWorkspace('?section=overview', plan);
    const title = await screen.findByRole('heading', { name: plan.name });
    const summary = screen.getByRole('region', { name: 'Funding summary' });
    expect(summary).toHaveTextContent('First funding shortfall: Jan 2026');
    expect(summary).toHaveTextContent('Project A');
    expect(
      summary.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    const navigation = screen.getByRole('navigation', {
      name: 'Plan sections',
    });
    expect(within(navigation).getAllByRole('button')).toHaveLength(4);
    expect(
      within(navigation).getByRole('button', { name: 'Overview' })
    ).toHaveAttribute('aria-current', 'page');
    expect(
      screen.getByRole('button', { name: 'Edit plan details' })
    ).toHaveTextContent('Plan details');
    expect(screen.getByRole('button', { name: 'Save plan' })).toBeDisabled();
    await user.click(
      within(navigation).getByRole('button', { name: 'Staffing' })
    );
    expect(
      screen.getAllByRole('region', { name: 'Funding summary' })
    ).toHaveLength(1);
    expect(
      within(navigation).getByRole('button', { name: 'Staffing' })
    ).toHaveAttribute('aria-current', 'page');
    await user.click(
      within(summary).getByRole('button', { name: 'Explore Project A' })
    );
    expect(
      await screen.findByRole('heading', { name: 'Project A' })
    ).toBeInTheDocument();
    expect(
      within(navigation).getByRole('button', { name: 'Overview' })
    ).toHaveAttribute('aria-current', 'page');
    const sourceTitle = screen.getByRole('heading', {
      name: 'Project A',
    });
    await waitFor(() => expect(sourceTitle).toHaveFocus());
    expect(
      sourceTitle.compareDocumentPosition(
        screen.getByLabelText('Outlook totals')
      ) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    await user.click(
      within(summary).getByRole('button', { name: 'Explore Project A' })
    );
    expect(sourceTitle).toHaveFocus();
    expect(read().location).toMatchObject({
      fundingSourceId: 1,
      section: 'overview',
    });
  });
});

describe('category budget persistence', () => {
  it('applies a rebudget through the source route and preserves it after save and reopen', async () => {
    const plan = createSalaryExample();
    plan.content.fundingSources[0].projectType = 'Sponsored';
    plan.content.fundingSources[0].budgets.push({
      budget: 5000,
      committed: 0,
      expenditureCategory: SUPPLIES_CATEGORY,
      spentToDate: 0,
    });
    const { user } = openWorkspace('?section=overview&source=1', plan);
    await user.click(
      await screen.findByRole('button', { name: 'Edit funding source' })
    );
    await screen.findByRole('dialog', { name: 'Edit Project A' });
    const supplies = screen.getByLabelText<HTMLInputElement>(
      `Budget for ${SUPPLIES_CATEGORY}`
    );
    const salary = screen.getByLabelText<HTMLInputElement>(
      `Budget for ${SALARY_CATEGORY}`
    );
    const salaryBudget = Number(salary.value) + 3000;
    await user.clear(supplies);
    await user.type(supplies, '2000');
    expect(read().pendingEditor?.hasChanges).toBe(true);
    await user.clear(salary);
    await user.type(salary, String(salaryBudget));
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(read().draft.content.fundingSources[0].categoryAdjustments).toEqual([
      { amount: 3000, expenditureCategory: SALARY_CATEGORY },
      { amount: -3000, expenditureCategory: SUPPLIES_CATEGORY },
    ]);
    await user.click(screen.getByRole('button', { name: 'Save plan' }));
    await waitFor(() =>
      expect(workspace.server.read().requests).toHaveLength(1)
    );
    const saved = workspace.server.read().stored!;
    expect(saved.content.fundingSources[0].budgets).toEqual(
      plan.content.fundingSources[0].budgets
    );
    cleanup();
    openWorkspace('?section=funding&source=1', saved);
    await screen.findByRole('dialog', { name: 'Edit Project A' });
    expect(
      screen.getByLabelText(`Budget for ${SUPPLIES_CATEGORY}`)
    ).toHaveValue('2000.00');
    expect(screen.getByLabelText(`Budget for ${SALARY_CATEGORY}`)).toHaveValue(
      salaryBudget.toFixed(2)
    );
  });
});

describe('projection source focus', () => {
  it('keeps category-only warnings visible and opens balances from both the alert and source row', async () => {
    const plan = createSalaryExample();
    plan.content.fundingSources[0].projectType = 'Sponsored';
    plan.content.fundingSources[0].budgets[0].budget = 1000;
    plan.content.fundingSources[0].budgets.push({
      budget: 50_000,
      committed: 0,
      expenditureCategory: SUPPLIES_CATEGORY,
      spentToDate: 0,
    });
    const { user } = openWorkspace('?section=overview', plan);
    const summary = await screen.findByRole('region', {
      name: 'Funding summary',
    });
    expect(summary).toHaveTextContent(
      'First category budget shortfall: Jan 2026'
    );
    expect(summary).toHaveClass('alert-error');
    const before = JSON.stringify(read().draft);
    await user.click(
      screen.getByRole('button', { name: 'Minimize funding summary' })
    );
    const restore = await screen.findByRole('button', {
      name: 'Show funding summary',
    });
    expect(restore).toHaveClass('text-error');
    await user.click(restore);
    await user.click(
      within(summary).getByRole('button', {
        name: 'View category balances for Project A',
      })
    );
    const heading = await screen.findByRole('heading', {
      name: 'Category and month worksheet',
    });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(
      screen.getByRole('table', {
        name: 'Project A category worksheet: Month-end balances',
      })
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Back to all funding sources' })
    );
    const sources = await screen.findByRole('table', {
      name: 'Funding sources',
    });
    await user.click(
      within(sources).getByRole('button', {
        name: 'View category shortfalls for Project A',
      })
    );
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Category and month worksheet' })
      ).toHaveFocus()
    );
    expect(
      screen.getByRole('table', {
        name: 'Project A category worksheet: Month-end balances',
      })
    ).toBeVisible();
    expect(JSON.stringify(read().draft)).toBe(before);
    expect(screen.getByRole('button', { name: 'Save plan' })).toBeDisabled();
  });

  it('takes a sponsored staffing warning directly to the visible category table', async () => {
    const plan = createSalaryExample();
    plan.content.fundingSources[0].projectType = 'Sponsored';
    plan.content.fundingSources[0].budgets.push({
      budget: 0,
      committed: 0,
      expenditureCategory: FRINGE_CATEGORY,
      spentToDate: 100,
    });
    const { user } = openWorkspace('?section=staffing', plan);
    const badge = await screen.findByRole('button', {
      name: 'Fringe budget shortfall',
    });
    badge.focus();
    await user.keyboard('{Enter}');
    const dialog = screen.getByRole('dialog', {
      name: 'Fringe budget shortfall',
    });
    const link = within(dialog).getByRole('button', {
      name: 'View category balances',
    });
    link.focus();
    await user.keyboard('{Enter}');
    const heading = await screen.findByRole('heading', {
      name: 'Category and month worksheet',
    });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(read().location).toMatchObject({
      fundingSourceId: 1,
      section: 'overview',
    });
    expect(
      screen.getByRole('table', {
        name: 'Project A category worksheet: Month-end balances',
      })
    ).toBeVisible();
  });

  it('focuses explicit source selection but leaves history scroll restoration alone', async () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
    try {
      const { history, user } = openWorkspace('?section=overview&source=1');
      await screen.findByRole('heading', { name: 'Project A' });
      expect(scroll).not.toHaveBeenCalled();
      await user.selectOptions(
        screen.getByRole('combobox', { name: 'Explore a funding source' }),
        '2'
      );
      const sourceTitle = await screen.findByRole('heading', {
        name: 'Project B',
      });
      await waitFor(() => expect(sourceTitle).toHaveFocus());
      expect(scroll).toHaveBeenCalledWith({ block: 'start' });
      scroll.mockClear();
      await act(async () => history.back());
      await screen.findByRole('heading', { name: 'Project A' });
      expect(scroll).not.toHaveBeenCalled();
      await act(async () => history.forward());
      await screen.findByRole('heading', { name: 'Project B' });
      expect(scroll).not.toHaveBeenCalled();
    } finally {
      scroll.mockRestore();
    }
  });
});

describe('projection salary workspace', () => {
  it('starts the outlook at the saved snapshot month while retaining prior spending', async () => {
    const plan = createSalaryExample();
    openWorkspace('?section=overview&source=1', plan);
    await screen.findByRole('heading', { name: 'Project A' });
    const table = screen.getByRole('table', {
      name: 'Project A category worksheet: Net forecast costs',
    });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .slice(1, 13)
        .map((cell) => cell.textContent)
    ).toEqual([
      'Jan 2026',
      'Feb 2026',
      'Mar 2026',
      'Apr 2026',
      'May 2026',
      'Jun 2026',
      'Jul 2026',
      'Aug 2026',
      'Sep 2026',
      'Oct 2026',
      'Nov 2026',
      'Dec 2026',
    ]);
    expect(read().draft.content.fundingSources[0].actuals).toEqual(
      plan.content.fundingSources[0].actuals
    );
    expect(read().results.rows.every(({ month }) => month >= '2026-01')).toBe(
      true
    );
  });

  it('preserves booked costs while salary edits change only the remaining snapshot forecast', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/projections/TEST-PI/1?section=overview&source=1'],
    });
    workspace = createProjectionWorkspaceHarness({
      history,
      plan: createBookedSalaryExample(),
    });
    const { router } = workspace;
    render(<RouterProvider router={router} />);
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Project A' });
    const monthlyTotal = (index: number) => {
      const table = screen.getByRole('table', {
        name: 'Project A category worksheet: Net forecast costs',
      });
      return within(table).getByText('Source overall').closest('tr')!.children[
        index
      ];
    };
    expect(monthlyTotal(1)).toHaveTextContent('$2,100');
    expect(monthlyTotal(1)).toHaveTextContent('Balance $24,500');

    await user.click(screen.getByRole('button', { name: 'Staffing' }));
    await user.click(editButton());
    await user.clear(salaryInput());
    await user.type(salaryInput(), '43200');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(read().revision).toBe(1));
    expect(
      read().results.rows.find(
        (row) =>
          row.fundingSourceId === 1 &&
          row.month === '2026-01' &&
          row.expenditureCategory === SALARY_CATEGORY
      )
    ).toMatchObject({
      actualAmount: 1000,
      projectedAmount: 0,
      remaining: 19_000,
    });

    await user.click(screen.getByRole('button', { name: 'Overview' }));
    await screen.findByRole('heading', { name: 'Project A' });
    expect(monthlyTotal(1)).toHaveTextContent('$0');
    expect(monthlyTotal(1)).toHaveTextContent('Balance $26,600');
    expect(monthlyTotal(2)).toHaveTextContent('$1,260');
    expect(monthlyTotal(2)).toHaveTextContent('Balance $25,340');
    expect(router.state.location.search).toMatchObject({
      source: 1,
    });

    await user.click(screen.getByRole('button', { name: 'Save plan' }));
    await waitFor(() => expect(read().dirty).toBe(false));
    expect(read().draft.content.fundingSources[0].actuals).toEqual([
      {
        amount: 1000,
        expenditureCategory: SALARY_CATEGORY,
        month: '2026-01-01',
      },
      {
        amount: 400,
        expenditureCategory: '02 - Fringe Benefits',
        month: '2026-01-01',
      },
    ]);
  });

  it('opens and focuses a direct appointment link; Cancel discards typing and Apply commits the same operation', async () => {
    const { user } = openWorkspace();
    await screen.findByRole('dialog');
    expect(salaryInput()).toHaveFocus();
    expect(read().pendingEditor).toEqual({
      appointmentId: 101,
      hasChanges: false,
      kind: 'appointment',
      validationMessage: null,
    });
    await user.clear(salaryInput());
    await user.type(salaryInput(), '132000');
    expect(read().draft.content.appointments[0].monthlySalary).toBe(10_000);
    expect(read().pendingEditor?.hasChanges).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(read()).toMatchObject({
      dirty: false,
      pendingEditor: null,
      revision: 0,
    });
    expect(editButton()).toHaveFocus();

    await user.click(editButton());
    expect(salaryInput()).toHaveValue('120000.00');
    await user.clear(salaryInput());
    await user.type(salaryInput(), '132000');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(read().revision).toBe(1));
    expect(read().draft.content.appointments[0].monthlySalary).toBe(11_000);
    expect(
      read().results.rows.every(
        (row) => row.projectedAmount === (row.month <= '2026-06' ? 2750 : 0)
      )
    ).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes');
    expect(editButton()).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Overview' }));
    expect(
      await screen.findByText(/First funding shortfall:/)
    ).toBeInTheDocument();
    expect(screen.getByText('-$500')).toBeInTheDocument();
  });

  it('rejects blank and invalid annual input, accepts zero, and keeps no-op precision', async () => {
    const plan = createSalaryExample();
    plan.content.appointments[0].monthlySalary = 10_000.123_45;
    const { user } = openWorkspace(undefined, plan);
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(read().draft.content.appointments[0].monthlySalary).toBe(
      10_000.123_45
    );
    expect(read().revision).toBe(0);

    await user.click(editButton());
    await user.clear(salaryInput());
    await user.type(salaryInput(), '0120001.48');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(read().draft.content.appointments[0].monthlySalary).toBe(
      10_000.123_45
    );
    expect(read().revision).toBe(0);

    await user.click(editButton());
    for (const value of ['', '-1', 'abc', '120000.001']) {
      await user.clear(salaryInput());
      if (value) {
        await user.type(salaryInput(), value);
      }
      expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
      expect(salaryInput()).toHaveAttribute('aria-invalid', 'true');
      expect(read().pendingEditor?.validationMessage).toBeTruthy();
      await user.keyboard('{Enter}');
      expect(read().revision).toBe(0);
    }
    await user.clear(salaryInput());
    await user.type(salaryInput(), '0');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(read().revision).toBe(1));
    expect(read().draft.content.appointments[0].monthlySalary).toBe(0);
  });

  it('preserves committed salary and source location through Back/Forward and discards a closed editor buffer', async () => {
    const { history, user } = openWorkspace('?section=overview&source=2');
    await screen.findByRole('heading', { name: 'Project B' });
    await user.click(screen.getByRole('button', { name: 'Staffing' }));
    await user.click(editButton());
    await user.clear(salaryInput());
    await user.type(salaryInput(), '132000');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(read().revision).toBe(1));
    await user.click(editButton());
    await user.clear(salaryInput());
    await user.type(salaryInput(), '144000');
    await act(async () => history.back());
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(read()).toMatchObject({
      location: { fundingSourceId: 2, section: 'staffing' },
      revision: 1,
    });
    await act(async () => history.forward());
    await screen.findByRole('dialog');
    expect(salaryInput()).toHaveValue('132000.00');
    expect(read().pendingEditor?.hasChanges).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Overview' }));
    expect(
      await screen.findByRole('heading', { name: 'Project B' })
    ).toHaveFocus();
    expect(read().draft.content.appointments[0].monthlySalary).toBe(11_000);
    await act(async () => history.back());
    await waitFor(() => expect(read().location.section).toBe('staffing'));
    await act(async () => history.forward());
    await screen.findByRole('heading', { name: 'Project B' });
    expect(read().revision).toBe(1);
  });

  it('retains committed draft when a workspace view remounts within its plan session', async () => {
    const user = userEvent.setup();
    const plan = createSalaryExample();
    const ref = createRef<ProjectionWorkspaceHandle>();
    const onNavigate = vi.fn();
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      projectionLookupsQueryOptions().queryKey,
      createAppointmentLookupsExample()
    );
    const view = (key: string, search: Record<string, unknown>) => (
      <QueryClientProvider client={queryClient}>
        <ProjectionSessionProvider initialPlan={plan}>
          <ProjectionWorkspace
            key={key}
            onNavigate={onNavigate}
            ref={ref}
            search={search}
          />
        </ProjectionSessionProvider>
      </QueryClientProvider>
    );
    const rendered = render(
      view('first', { appointment: 101, section: 'staffing' })
    );
    await user.clear(salaryInput());
    await user.type(salaryInput(), '132000');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    rendered.rerender(view('second', { section: 'overview', source: 1 }));
    expect(ref.current!.read()).toMatchObject({ dirty: true, revision: 1 });
    expect(
      ref.current!.read().draft.content.appointments[0].monthlySalary
    ).toBe(11_000);
    expect(
      screen.getByRole('heading', { name: 'Project A' })
    ).toBeInTheDocument();
  });

  it('treats Escape cancellation like Cancel and restores the appointment control focus', async () => {
    openWorkspace();
    const dialog = await screen.findByRole('dialog');
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(read()).toMatchObject({ dirty: false, revision: 0 });
    expect(editButton()).toHaveFocus();
  });

  it.each([
    ['?section=unknown', 'This plan section does not exist.'],
    [
      '?section=staffing&appointment=999',
      'Appointment 999 is not in this plan.',
    ],
    [
      '?section=staffing&appointment=abc',
      'The appointment target is malformed.',
    ],
    ['?section=overview&source=999', 'Funding source 999 is not in this plan.'],
    ['?section=overview&source=-2', 'The source target is malformed.'],
    [
      '?section=overview&appointment=101',
      'An appointment editor must be opened in Staffing.',
    ],
  ])(
    'handles an invalid direct location %s explicitly',
    async (search, message) => {
      const { user } = openWorkspace(search);
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(read().revision).toBe(0);
      await user.click(
        screen.getByRole('button', { name: 'Open plan overview' })
      );
      await waitFor(() =>
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      );
      expect(read().location).toEqual({
        appointmentId: null,
        fundingDate: null,
        fundingMonth: null,
        fundingSourceId: null,
        issues: [],
        section: 'overview',
      });
    }
  );
});
