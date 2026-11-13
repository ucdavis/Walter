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
      within(navigation).getByRole('button', { name: 'Other expenses' })
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
      within(navigation).getByRole('button', { name: 'Funding outlook' })
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
      await screen.findByRole('heading', { name: 'Project A details' })
    ).toBeInTheDocument();
    expect(
      within(navigation).getByRole('button', { name: 'Funding outlook' })
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
  it('applies a budget move through the source route and preserves it after save and reopen', async () => {
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
      await screen.findByRole('button', { name: 'Edit budget' })
    );
    await screen.findByRole('dialog', { name: 'Edit Project A' });
    await user.click(screen.getByRole('button', { name: 'Move budget' }));
    await user.selectOptions(
      screen.getByLabelText('From category'),
      SUPPLIES_CATEGORY
    );
    await user.selectOptions(
      screen.getByLabelText('To category'),
      SALARY_CATEGORY
    );
    await user.type(screen.getByLabelText('Amount'), '3000');
    expect(read().pendingEditor?.hasChanges).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Move amount' }));
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
    expect(screen.getByLabelText('Net budget changes')).toHaveTextContent(
      '$3,000.00'
    );
    expect(screen.getByLabelText('Net budget changes')).toHaveTextContent(
      '-$3,000.00'
    );
  });
});

describe('projection source focus', () => {
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
      name: 'Category budget balances',
    });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(read().location).toMatchObject({
      fundingSourceId: 1,
      section: 'overview',
    });
    expect(
      screen.getByRole('table', {
        name: 'Captured category budgets and remaining balances at plan end',
      })
    ).toBeVisible();
  });

  it('focuses explicit source selection but leaves history scroll restoration alone', async () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
    try {
      const { history, user } = openWorkspace('?section=overview&source=1');
      await screen.findByRole('heading', { name: 'Project A details' });
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
      await screen.findByRole('heading', { name: 'Project A details' });
      expect(scroll).not.toHaveBeenCalled();
      await act(async () => history.forward());
      await screen.findByRole('heading', { name: 'Project B details' });
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
    await screen.findByRole('heading', { name: 'Project A details' });
    await userEvent.click(screen.getByText('Monthly balances and costs'));
    const table = screen.getByRole('table', {
      name: 'Monthly actuals, forecast, and remaining balance for Project A',
    });
    expect(
      within(table)
        .getAllByRole('rowheader')
        .map((cell) => cell.textContent)
    ).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
    ]);
    expect(read().draft.content.fundingSources[0].actuals).toEqual(
      plan.content.fundingSources[0].actuals
    );
    expect(read().results.rows.every(({ month }) => month >= '2026-01')).toBe(
      true
    );
  });

  it('keeps booked costs visible while salary edits change only the remaining snapshot forecast', async () => {
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
    await screen.findByRole('heading', { name: 'Project A details' });
    await user.click(screen.getByText('Monthly balances and costs'));
    const january = () => screen.getByRole('row', { name: /^2026-01 / });
    expect(
      within(january())
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
    ).toEqual(['$1,400.00', '$2,100.00', '$24,500.00']);

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

    await user.click(screen.getByRole('button', { name: 'Funding outlook' }));
    await screen.findByRole('heading', { name: 'Project A details' });
    await user.click(screen.getByText('Monthly balances and costs'));
    expect(
      within(january())
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
    ).toEqual(['$1,400.00', '$0.00', '$26,600.00']);
    const february = screen.getByRole('row', { name: /^2026-02 / });
    expect(
      within(february)
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
    ).toEqual(['$0.00', '$1,260.00', '$25,340.00']);
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
    await user.click(screen.getByRole('button', { name: 'Funding outlook' }));
    expect(
      await screen.findByText(/First funding shortfall:/)
    ).toBeInTheDocument();
    expect(screen.getByText('-$500.00')).toBeInTheDocument();
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
    await screen.findByRole('heading', { name: 'Project B details' });
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
    await user.click(screen.getByRole('button', { name: 'Funding outlook' }));
    expect(
      await screen.findByRole('heading', { name: 'Project B' })
    ).toHaveFocus();
    expect(read().draft.content.appointments[0].monthlySalary).toBe(11_000);
    await act(async () => history.back());
    await waitFor(() => expect(read().location.section).toBe('staffing'));
    await act(async () => history.forward());
    await screen.findByRole('heading', { name: 'Project B details' });
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
      screen.getByRole('heading', { name: 'Project A details' })
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
        fundingMonth: null,
        fundingSourceId: null,
        issues: [],
        section: 'overview',
      });
    }
  );
});
