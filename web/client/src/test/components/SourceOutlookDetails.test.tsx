import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FundingOutlook } from '@/components/projections/FundingOutlook.tsx';
import {
  computePiProjection,
  FEE_REMISSION_CATEGORY,
  FRINGE_CATEGORY,
  SALARY_CATEGORY,
  SUPPLIES_CATEGORY,
} from '@/lib/piProjection.ts';
import { buildProjectionOutlook } from '@/lib/projectionOutlook.ts';
import type { ProjectionDraft } from '@/queries/projections.ts';

afterEach(cleanup);

function example(): ProjectionDraft {
  return {
    content: {
      appointments: [
        {
          allocations: [
            {
              endDate: null,
              fundingSourceId: 1,
              percent: 0.5,
              startDate: null,
            },
            {
              endDate: null,
              fundingSourceId: null,
              percent: 0.5,
              startDate: null,
            },
          ],
          cbrRate: 0.2,
          colaMonth: 7,
          colaRate: 0,
          employeeId: null,
          endDate: '2026-12-31',
          feeRemissionMonthly: 100,
          fte: 0.5,
          hasUnmatchedFunding: false,
          id: 101,
          isSeeded: true,
          jobCode: null,
          monthlySalary: 1000,
          name: 'Alex Example',
          positionNumber: null,
          rateSet: 'UCDAVIS',
          startDate: '2026-01-01',
          title: 'Researcher',
          vacationAccrualRate: 0,
        },
      ],
      comparison: { appointments: [], fundingSources: [] },
      forecastMonths: 12,
      fundingSources: [
        {
          actuals: [
            {
              amount: 100,
              expenditureCategory: SALARY_CATEGORY,
              month: '2026-01-01',
            },
            {
              amount: 20,
              expenditureCategory: FRINGE_CATEGORY,
              month: '2026-01-01',
            },
          ],
          awardName: null,
          awardNumber: null,
          balanceAdjustment: 0,
          budgets: [
            {
              budget: 10_000,
              committed: 0,
              expenditureCategory: SALARY_CATEGORY,
              spentToDate: 100,
            },
            {
              budget: 1000,
              committed: 0,
              expenditureCategory: FRINGE_CATEGORY,
              spentToDate: 20,
            },
          ],
          capturedAt: '2026-01-16T00:00:00Z',
          capturedEndDate: '2026-12-31',
          capturedStartDate: '2026-01-01',
          categoryAdjustments: [],
          endDate: '2026-12-31',
          expenses: [
            {
              amount: -50,
              description: 'Supplies credit',
              endMonth: null,
              expenditureCategory: SUPPLIES_CATEGORY,
              id: 1,
              kind: 'OneTime',
              startMonth: '2026-02-01',
            },
          ],
          historicalExpenseOverrides: [],
          id: 1,
          initialPlannedBalance: 0,
          name: 'Project A',
          plannedBudgetMode: null,
          projectName: 'Project A',
          projectNumber: 'A',
          projectType: 'Internal',
          runRates: [],
          sourceKind: 'Task',
          startDate: '2026-01-01',
          taskName: null,
          taskNumber: null,
        },
      ],
      historyMonths: 3,
      lastAppointmentId: 0,
      lastFundingSourceId: 0,
      notes: null,
    },
    name: 'Cost detail example',
    seededAt: '2026-01-16T00:00:00Z',
  };
}

function open(plan = example()) {
  const results = computePiProjection(plan);
  const outlook = buildProjectionOutlook(plan, results);
  const onNavigate = vi.fn();
  render(
    <FundingOutlook
      draft={plan}
      onNavigate={onNavigate}
      outlook={outlook}
      results={results}
      selectedSourceId={1}
    />
  );
  return { onNavigate, user: userEvent.setup() };
}

describe('source outlook details', () => {
  it('expands the worksheet without changing amounts and returns focus on Escape', async () => {
    const { user } = open();
    const monthly = screen.getByRole('table', {
      name: 'Project A category worksheet: Net forecast costs',
    });
    const section = screen.getByRole('region', {
      name: 'Category and month worksheet',
    });
    const expand = within(section).getByRole('button', {
      name: 'Expand table',
    });
    const before = monthly.textContent;
    await user.click(expand);
    expect(
      within(section).getByRole('button', { name: 'Collapse table' })
    ).toBeVisible();
    expect(monthly.textContent).toBe(before);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(expand).toHaveFocus());
    expect(monthly.textContent).toBe(before);
  });

  it('shows additional costs with fees and signed credits without deducting booked costs twice', async () => {
    const previouslyFocused = document.activeElement;
    open();
    expect(screen.getByRole('heading', { name: 'Project A' })).toBeVisible();
    // Navigation owns focus; rendering details alone must not move it.
    expect(document.activeElement).toBe(previouslyFocused);
    const breakdown = screen.getByLabelText('Forecast spending breakdown');
    expect(breakdown).toHaveTextContent('Salary$2,900');
    expect(breakdown).toHaveTextContent('Fringe$580');
    expect(breakdown).toHaveTextContent('Staff fees$600');
    expect(breakdown).toHaveTextContent('Other expenses-$50');

    expect(
      screen.queryByText('Forecast costs by category')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Category budget balances' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Captured balance')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit budget' })
    ).not.toBeInTheDocument();
    expect(screen.getByText('Funding ends Dec 31, 2026')).toBeVisible();
    expect(screen.queryByText(/Funding starts/)).not.toBeInTheDocument();
    const categories = screen.getByRole('table', {
      name: 'Project A category worksheet: Net forecast costs',
    });
    expect(
      within(categories).getByRole('row', {
        name: new RegExp(FEE_REMISSION_CATEGORY),
      })
    ).toHaveTextContent('$600');
    expect(
      within(categories).getByRole('row', {
        name: new RegExp(SUPPLIES_CATEGORY),
      })
    ).toHaveTextContent('-$50');

    const monthly = screen.getByRole('table', {
      name: 'Project A category worksheet: Net forecast costs',
    });
    const january = within(monthly).getByText('Source overall').closest('tr')!
      .children[1];
    expect(january).toHaveTextContent('$230');
    expect(january).toHaveTextContent('Balance $10,650');
  });

  it('links source, expense, appointment, and allocation editors from staff details', async () => {
    const { onNavigate, user } = open();
    await user.click(
      screen.getByRole('button', { name: 'Edit funding source' })
    );
    expect(onNavigate).toHaveBeenLastCalledWith({
      section: 'funding',
      source: 1,
    });
    await user.click(
      screen.getByRole('button', { name: 'Edit other expenses' })
    );
    expect(onNavigate).toHaveBeenLastCalledWith({
      section: 'expenses',
      source: 1,
    });
    const appointments = screen.getByRole('region', {
      name: 'Staff costs by month',
    });
    await user.click(
      within(appointments).getByRole('button', {
        name: 'View appointment details for Alex Example',
      })
    );
    expect(appointments).toHaveTextContent(
      '50% of appointment · 25% full-time FTE · Appointment start through appointment end'
    );
    expect(appointments).toHaveTextContent('50% appointment FTE');

    await user.click(
      screen.getByRole('button', { name: 'Edit appointment for Alex Example' })
    );
    expect(onNavigate).toHaveBeenLastCalledWith({
      appointment: 101,
      section: 'staffing',
      source: 1,
    });
    await user.click(
      screen.getByRole('button', {
        name: 'View appointment details for Alex Example',
      })
    );
    await user.click(
      screen.getByRole('button', { name: 'Edit allocations for Alex Example' })
    );
    expect(onNavigate).toHaveBeenLastCalledWith({
      appointment: 101,
      fundingDate: '2026-01-01',
      fundingMonth: '2026-01',
      section: 'staffing',
      source: 1,
    });
  });

  it('retains out-of-period assignments and entered funding without fabricating monthly amounts', async () => {
    const plan = example();
    const source = plan.content.fundingSources[0];
    source.startDate = '2027-01-01';
    source.endDate = '2027-12-31';
    source.sourceKind = 'Planned';
    source.budgets = [];
    source.actuals = [];
    source.balanceAdjustment = 5000;
    const { user } = open(plan);
    await user.click(
      screen.getByRole('button', {
        name: 'View appointment details for Alex Example',
      })
    );
    expect(
      screen.getByText(/Its entered funding and allocations remain saved/)
    ).toBeVisible();
    expect(screen.getByText('$5,000')).toBeVisible();
    expect(
      screen.getByText('Funding starts Jan 1, 2027 · Funding ends Dec 31, 2027')
    ).toBeVisible();
    expect(
      screen.getByRole('region', { name: 'Staff costs by month' })
    ).toHaveTextContent(
      'No funded share from this source is active in the forecast period.'
    );
    expect(
      screen.getByText(
        /No category costs or monthly balances in this forecast period/
      )
    ).toBeVisible();
    expect(
      screen.queryByRole('table', { name: /category worksheet/ })
    ).not.toBeInTheDocument();
  });

  it('shows a dated later allocation and opens its first active month', async () => {
    const plan = example();
    plan.content.appointments[0].allocations[0] = {
      endDate: '2026-09-30',
      fundingSourceId: 1,
      percent: 0.25,
      startDate: '2026-07-15',
    };
    const { onNavigate, user } = open(plan);
    await user.click(
      screen.getByRole('button', {
        name: 'View appointment details for Alex Example',
      })
    );
    expect(
      screen.getByRole('region', { name: 'Staff costs by month' })
    ).toHaveTextContent(
      '25% of appointment · 12.5% full-time FTE · 2026-07-15 through 2026-09-30'
    );
    await user.click(
      screen.getByRole('button', { name: 'Edit allocations for Alex Example' })
    );
    expect(onNavigate).toHaveBeenLastCalledWith({
      appointment: 101,
      fundingDate: '2026-07-15',
      fundingMonth: '2026-07',
      section: 'staffing',
      source: 1,
    });
  });

  it('opens a saved future allocation even when it is beyond the forecast', async () => {
    const plan = example();
    const appointment = plan.content.appointments[0];
    appointment.startDate = '2027-03-15';
    appointment.endDate = '2027-12-31';
    appointment.allocations = [
      {
        endDate: '2027-09-30',
        fundingSourceId: 1,
        percent: 0.5,
        startDate: '2027-01-01',
      },
    ];
    const { onNavigate, user } = open(plan);
    await user.click(
      screen.getByRole('button', {
        name: 'View appointment details for Alex Example',
      })
    );
    await user.click(
      screen.getByRole('button', { name: 'Edit allocations for Alex Example' })
    );
    expect(onNavigate).toHaveBeenLastCalledWith({
      appointment: 101,
      fundingDate: '2027-03-15',
      fundingMonth: '2027-03',
      section: 'staffing',
      source: 1,
    });
  });

  it('keeps the appointment editor available when saved allocation dates do not overlap', async () => {
    const plan = example();
    plan.content.appointments[0].allocations = [
      {
        endDate: '2027-09-30',
        fundingSourceId: 1,
        percent: 0.5,
        startDate: '2027-01-01',
      },
    ];
    const { onNavigate, user } = open(plan);
    await user.click(
      screen.getByRole('button', {
        name: 'View appointment details for Alex Example',
      })
    );
    expect(
      screen.queryByRole('button', {
        name: 'Edit allocations for Alex Example',
      })
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Edit appointment for Alex Example' })
    );
    expect(onNavigate).toHaveBeenLastCalledWith({
      appointment: 101,
      section: 'staffing',
      source: 1,
    });
  });
});
