import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SourceOutlookDetails } from '@/components/projections/SourceOutlookDetails.tsx';
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
          name: 'Project A',
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
      notes: null,
    },
    name: 'Cost detail example',
    seededAt: '2026-01-16T00:00:00Z',
  };
}

function open(plan = example()) {
  const results = computePiProjection(plan);
  const outlook = buildProjectionOutlook(plan, results).sources[0];
  const onNavigate = vi.fn();
  render(
    <SourceOutlookDetails
      draft={plan}
      onNavigate={onNavigate}
      outlook={outlook}
      results={results}
    />
  );
  return { onNavigate, user: userEvent.setup() };
}

describe('source outlook details', () => {
  it('shows additional costs with fees and signed credits while keeping booked costs separate', async () => {
    const { user } = open();
    expect(
      screen.getByRole('heading', { name: 'Project A details' })
    ).toHaveFocus();
    const breakdown = screen.getByRole('region', {
      name: 'Net forecast cost breakdown',
    });
    expect(breakdown).toHaveTextContent('Salary$2,900.00');
    expect(breakdown).toHaveTextContent('Fringe$580.00');
    expect(breakdown).toHaveTextContent('Other forecast costs$550.00');

    await user.click(
      screen.getByText('Forecast costs by category', { selector: 'summary' })
    );
    const categories = screen.getByRole('table', {
      name: 'Project A forecast costs by category',
    });
    expect(
      within(categories).getByRole('row', {
        name: new RegExp(FEE_REMISSION_CATEGORY),
      })
    ).toHaveTextContent('$600.00');
    expect(
      within(categories).getByRole('row', {
        name: new RegExp(SUPPLIES_CATEGORY),
      })
    ).toHaveTextContent('-$50.00');

    await user.click(
      screen.getByText('Monthly balances and costs', { selector: 'summary' })
    );
    const monthly = screen.getByRole('table', {
      name: 'Monthly actuals, forecast, and remaining balance for Project A',
    });
    expect(
      within(monthly).getByRole('row', { name: /^2026-01 / })
    ).toHaveTextContent('2026-01$120.00$230.00$10,650.00');
    expect(
      screen.getByText(/Booked costs in the capture month are already included/)
    ).toBeVisible();
  });

  it('links source, expense, appointment, and allocation editors without inventing per-person costs', async () => {
    const { onNavigate, user } = open();
    const appointments = screen.getByRole('region', {
      name: 'Appointments using this source',
    });
    expect(appointments).toHaveTextContent(
      '50% of appointment · 25% full-time FTE · Appointment start through appointment end'
    );
    expect(appointments).toHaveTextContent('50% appointment FTE');
    expect(appointments.textContent).not.toContain('$');

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
    await user.click(
      screen.getByRole('button', { name: 'Edit appointment for Alex Example' })
    );
    expect(onNavigate).toHaveBeenLastCalledWith({
      appointment: 101,
      section: 'staffing',
      source: 1,
    });
    await user.click(
      screen.getByRole('button', { name: 'Edit allocations for Alex Example' })
    );
    expect(onNavigate).toHaveBeenLastCalledWith({
      appointment: 101,
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
    expect(
      screen.getByText(/Its entered funding and allocations remain saved/)
    ).toBeVisible();
    expect(screen.getByText('$5,000.00')).toBeVisible();
    expect(
      screen.getByRole('region', { name: 'Appointments using this source' })
    ).toHaveTextContent(
      'No funded share from this source is active in the forecast period.'
    );
    await user.click(
      screen.getByText('Monthly balances and costs', { selector: 'summary' })
    );
    expect(
      screen.getByText('No monthly balance or costs in this forecast period.')
    ).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
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
    expect(
      screen.getByRole('region', { name: 'Appointments using this source' })
    ).toHaveTextContent(
      '25% of appointment · 12.5% full-time FTE · 2026-07-15 through 2026-09-30'
    );
    await user.click(
      screen.getByRole('button', { name: 'Edit allocations for Alex Example' })
    );
    expect(onNavigate).toHaveBeenLastCalledWith({
      appointment: 101,
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
      screen.getByRole('button', { name: 'Edit allocations for Alex Example' })
    );
    expect(onNavigate).toHaveBeenLastCalledWith({
      appointment: 101,
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
