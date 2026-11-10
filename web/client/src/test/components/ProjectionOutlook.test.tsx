import { FundingOutlookNotice } from '@/components/projections/FundingOutlookSummary.tsx';
import { buildProjectionOutlook } from '@/lib/projectionOutlook.ts';
import { cloneElement, type ComponentProps, type ReactElement } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FundingOutlook } from '@/components/projections/FundingOutlook.tsx';
import {
  computePiProjection,
  SALARY_CATEGORY,
  SUPPLIES_CATEGORY,
} from '@/lib/piProjection.ts';
import type {
  ProjectionAppointment,
  ProjectionDraft,
  ProjectionFundingSource,
} from '@/queries/projections.ts';

vi.mock('recharts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('recharts')>()),
  ResponsiveContainer: ({
    children,
  }: {
    children: ReactElement<{ height: number; width: number }>;
  }) => cloneElement(children, { height: 320, width: 800 }),
}));

afterEach(cleanup);

function source(id: number, balance: number): ProjectionFundingSource {
  return {
    actuals: [],
    awardName: null,
    awardNumber: null,
    balanceAdjustment: 0,
    budgets: [
      {
        budget: balance,
        committed: 0,
        expenditureCategory: SALARY_CATEGORY,
        spentToDate: 0,
      },
    ],
    capturedAt: '2026-01-01T00:00:00Z',
    capturedEndDate: null,
    capturedStartDate: '2026-01-01',
    endDate: null,
    expenses: [],
    historicalExpenseOverrides: [],
    id,
    name: `Source ${id}`,
    projectName: 'Field research',
    projectNumber: 'P1',
    projectType: 'Internal',
    runRates: [],
    sourceKind: 'Task',
    startDate: '2026-01-01',
    taskName: null,
    taskNumber: String(id),
  };
}

function appointment(id: number, percent: number): ProjectionAppointment {
  return {
    allocations: [
      { endDate: null, fundingSourceId: 1, percent, startDate: null },
    ],
    cbrRate: 0,
    colaMonth: 7,
    colaRate: 0,
    employeeId: null,
    endDate: null,
    feeRemissionMonthly: null,
    fte: 1,
    hasUnmatchedFunding: false,
    id,
    isSeeded: false,
    jobCode: null,
    monthlySalary: 0,
    name: `Person ${id}`,
    positionNumber: null,
    rateSet: 'UCDAV',
    startDate: '2026-01-01',
    title: null,
    vacationAccrualRate: 0,
  };
}

function plan(): ProjectionDraft {
  const short = source(1, 50);
  short.expenses = [
    {
      amount: 100,
      description: 'January cost',
      endMonth: null,
      expenditureCategory: SUPPLIES_CATEGORY,
      id: 1,
      kind: 'OneTime',
      startMonth: '2026-01-01',
    },
    {
      amount: -100,
      description: 'February credit',
      endMonth: null,
      expenditureCategory: SUPPLIES_CATEGORY,
      id: 2,
      kind: 'OneTime',
      startMonth: '2026-02-01',
    },
  ];
  const future = source(3, 0);
  Object.assign(future, {
    balanceAdjustment: 5000,
    budgets: [],
    name: 'Future grant',
    projectName: null,
    projectNumber: null,
    sourceKind: 'Planned',
    startDate: '2028-01-01',
    taskNumber: null,
  });
  return {
    content: {
      appointments: [appointment(1, 0.5), appointment(2, 1.25)],
      forecastMonths: 12,
      fundingSources: [short, source(2, 1000), future],
      historyMonths: 3,
      notes: null,
    },
    name: 'Field season',
    seededAt: '2026-01-01T00:00:00Z',
  };
}

function OutlookView(props: ComponentProps<typeof FundingOutlook>) {
  return (
    <>
      <FundingOutlookNotice
        onNavigate={props.onNavigate}
        outlook={props.outlook}
      />
      <FundingOutlook {...props} />
    </>
  );
}

async function show(draft = plan(), selectedSourceId: number | null = null) {
  const onNavigate = vi.fn();
  const results = computePiProjection(draft);
  const view = render(
    <OutlookView
      draft={draft}
      onNavigate={onNavigate}
      outlook={buildProjectionOutlook(draft, results)}
      results={results}
      selectedSourceId={selectedSourceId}
    />
  );
  await screen.findByRole('img', {}, { timeout: 5000 });
  return { ...view, draft, onNavigate, results, user: userEvent.setup() };
}

const chartLines = () => document.querySelectorAll('.recharts-line-curve');

describe('funding outlook', () => {
  it('keeps a recovered task shortfall visible under a positive project rollup', async () => {
    const { onNavigate, user } = await show();
    expect(
      screen.getByRole('region', { name: 'Funding summary' })
    ).toHaveTextContent('First funding shortfall: Jan 2026');
    expect(
      screen.getByRole('region', { name: 'Funding summary' })
    ).toHaveTextContent('Source 1 · Task 1');
    const table = screen.getByRole('table', { name: 'Funding sources' });
    expect(within(table).getByText('1 task shortfall')).toBeInTheDocument();
    expect(within(table).getByText('$1,050.00')).toBeInTheDocument();
    await user.click(
      within(table).getByRole('button', { name: /Field research/ })
    );
    expect(within(table).getByText('Recovers by plan end')).toBeInTheDocument();
    await user.click(
      within(table).getByRole('button', { name: 'View Source 1 · Task 1' })
    );
    expect(onNavigate).toHaveBeenLastCalledWith({
      section: 'overview',
      source: 1,
    });
  });

  it('hides lines without changing totals, warnings, the draft, or full project sums', async () => {
    const { draft, user } = await show();
    const before = JSON.stringify(draft);
    const summary = screen.getByRole('region', {
      name: 'Funding summary',
    }).textContent;
    const beforeTotals = screen.getByLabelText('Outlook totals').textContent;
    expect(chartLines()).toHaveLength(2);
    await user.click(screen.getByText(/Chart lines ·/));
    await user.click(
      screen.getByRole('checkbox', { name: 'Source 1 · Task 1' })
    );
    expect(chartLines()).toHaveLength(1);
    expect(screen.getByLabelText('Outlook totals')).toHaveTextContent(
      beforeTotals!
    );
    expect(
      screen.getByRole('region', { name: 'Funding summary' })
    ).toHaveTextContent(summary!);
    await user.click(
      screen.getByRole('checkbox', { name: 'Group by project' })
    );
    expect(chartLines()).toHaveLength(1);
    expect(
      screen.getByRole('checkbox', { name: 'Field research' })
    ).toBeChecked();
    expect(
      screen.getByRole('table', { name: 'Funding sources' })
    ).toHaveTextContent('$1,050.00');
    await user.click(
      within(
        screen.getByRole('navigation', { name: 'Chart legend' })
      ).getByRole('button', { name: 'Field research' })
    );
    expect(
      screen.getByRole('button', { name: 'View Source 1 · Task 1' })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hide all lines' }));
    expect(chartLines()).toHaveLength(0);
    await user.click(
      screen.getByRole('checkbox', { name: 'Group by project' })
    );
    expect(chartLines()).toHaveLength(1);
    expect(
      screen.getByRole('checkbox', { name: 'Source 1 · Task 1' })
    ).not.toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Source 2 · Task 2' })
    ).toBeChecked();
    expect(JSON.stringify(draft)).toBe(before);
  });

  it('lists future funding without including its balance or drawing a line', async () => {
    const { onNavigate, user } = await show();
    expect(screen.getByLabelText('Outlook totals')).not.toHaveTextContent(
      '$5,000.00'
    );
    expect(chartLines()).toHaveLength(2);
    await user.click(screen.getByText(/Chart lines ·/));
    expect(
      screen.getByRole('checkbox', {
        name: 'Future grant: Outside forecast period',
      })
    ).toBeDisabled();
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Explore a funding source' }),
      '3'
    );
    expect(onNavigate).toHaveBeenLastCalledWith({
      section: 'overview',
      source: 3,
    });
  });

  it('distinguishes an eligible empty source from one outside the period', async () => {
    const draft = plan();
    const empty = source(4, 0);
    empty.budgets = [];
    empty.projectNumber = 'P2';
    draft.content.fundingSources.push(empty);
    const { user } = await show(draft);
    const row = screen
      .getByRole('button', { name: 'View Source 4 · Task 4' })
      .closest('tr')!;
    expect(row).toHaveTextContent('No forecast data in this period');
    expect(row).not.toHaveTextContent('Outside forecast period');
    await user.click(screen.getByText(/Chart lines ·/));
    expect(
      screen.getByRole('checkbox', {
        name: 'Source 4 · Task 4: No forecast data in this period',
      })
    ).toBeDisabled();
  });

  it('links separate appointment gap and overlap counts to Staffing', async () => {
    const { onNavigate, user } = await show();
    const summary = screen.getByRole('region', { name: 'Funding summary' });
    expect(summary).toHaveTextContent(
      '1 appointment has unallocated time; 1 appointment has overlapping allocations'
    );
    await user.click(
      within(summary).getByRole('button', { name: 'Review staffing' })
    );
    expect(onNavigate).toHaveBeenLastCalledWith({ section: 'staffing' });
  });

  it('opens a previously hidden source in detail and preserves overview line choices on return', async () => {
    const { draft, onNavigate, rerender, results, user } = await show();
    await user.click(screen.getByText(/Chart lines ·/));
    await user.click(
      screen.getByRole('checkbox', { name: 'Source 1 · Task 1' })
    );
    rerender(
      <OutlookView
        draft={draft}
        onNavigate={onNavigate}
        outlook={buildProjectionOutlook(draft, results)}
        results={results}
        selectedSourceId={1}
      />
    );
    expect(
      screen.getByRole('img', {
        name: 'Monthly remaining balance for Source 1 · Task 1',
      })
    ).toBeInTheDocument();
    expect(document.querySelector('.recharts-area-curve')).not.toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Source 1 · Task 1 details' })
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Back to all funding sources' })
    );
    expect(onNavigate).toHaveBeenLastCalledWith({ section: 'overview' });
    rerender(
      <OutlookView
        draft={draft}
        onNavigate={onNavigate}
        outlook={buildProjectionOutlook(draft, results)}
        results={results}
        selectedSourceId={null}
      />
    );
    expect(chartLines()).toHaveLength(1);
  });
});
