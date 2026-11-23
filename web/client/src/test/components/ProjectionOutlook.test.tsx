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
    categoryAdjustments: [],
    endDate: null,
    expenses: [],
    historicalExpenseOverrides: [],
    id,
    initialPlannedBalance: 0,
    name: `Source ${id}`,
    plannedBudgetMode: null,
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
      comparison: { appointments: [], fundingSources: [] },
      forecastMonths: 12,
      fundingSources: [short, source(2, 1000), future],
      historyMonths: 3,
      lastAppointmentId: 0,
      lastFundingSourceId: 0,
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
        onViewCategoryBalances={props.onViewCategoryBalances}
        outlook={props.outlook}
      />
      <FundingOutlook {...props} />
    </>
  );
}

async function show(draft = plan(), selectedSourceId: number | null = null) {
  const onNavigate = vi.fn();
  const onViewCategoryBalances = vi.fn();
  const results = computePiProjection(draft);
  const view = render(
    <OutlookView
      draft={draft}
      onNavigate={onNavigate}
      onViewCategoryBalances={onViewCategoryBalances}
      outlook={buildProjectionOutlook(draft, results)}
      results={results}
      selectedSourceId={selectedSourceId}
    />
  );
  if (selectedSourceId !== null || draft.content.fundingSources.length === 1) {
    await screen.findByRole('img', {}, { timeout: 5000 });
  }
  return {
    ...view,
    draft,
    onNavigate,
    onViewCategoryBalances,
    results,
    user: userEvent.setup(),
  };
}

const chartLines = () => document.querySelectorAll('.recharts-line-curve');

describe('funding outlook', () => {
  it('defaults to the sole funding source and shows its forecast details', async () => {
    const draft = plan();
    draft.content.fundingSources = [source(2, 1000)];
    await show(draft);
    expect(
      screen.getByRole('combobox', { name: 'Explore a funding source' })
    ).toHaveValue('2');
    expect(
      screen.getByRole('heading', { name: 'Source 2 · Task 2' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: 'Monthly remaining balance for Source 2 · Task 2',
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: /All funding sources/ })
    ).not.toBeInTheDocument();
  });

  it('defaults to all funding sources when there are multiple choices', async () => {
    await show();
    expect(
      screen.getByRole('combobox', { name: 'Explore a funding source' })
    ).toHaveValue('');
    expect(
      screen.getByRole('heading', { name: 'Project outlook' })
    ).toBeInTheDocument();
  });

  it('qualifies positive totals when category budgets are unverified in summary, group, and source views', async () => {
    const draft = plan();
    draft.content.appointments = [];
    draft.content.fundingSources = [source(1, 500), source(2, 500)];
    draft.content.fundingSources[0].projectType = null;
    const { onNavigate, rerender, results, user } = await show(draft);
    expect(
      screen.queryByText('Each funding source stays within funding')
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Overall balances stay within funding; category budgets unverified'
      )
    ).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Funding sources' });
    expect(table).toHaveTextContent('Category budgets unverified');
    await user.click(
      within(table).getByRole('button', { name: /Field research/ })
    );
    const unknownRow = within(table)
      .getByRole('button', { name: 'View Source 1 · Task 1' })
      .closest('tr')!;
    expect(unknownRow).toHaveTextContent('Overall within funding');
    expect(unknownRow).toHaveTextContent('Category budgets unverified');
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
      screen.getByText(
        'Overall balance stays within funding; category budgets unverified'
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Stays within funding throughout this plan')
    ).not.toBeInTheDocument();
  });

  it('keeps an earlier overall shortfall first while also calling out later category shortfalls', async () => {
    const draft = plan();
    const second = draft.content.fundingSources[1];
    second.projectType = 'Sponsored';
    second.expenses = [
      {
        ...structuredClone(draft.content.fundingSources[0].expenses[0]),
        startMonth: '2026-02-01',
      },
    ];
    await show(draft);
    const summary = screen.getByRole('region', { name: 'Funding summary' });
    expect(summary).toHaveTextContent('First funding shortfall: Jan 2026');
    expect(summary).toHaveTextContent(
      '1 source has category budget shortfalls'
    );
    expect(
      within(summary).getByRole('button', { name: 'Explore Source 1 · Task 1' })
    ).toBeInTheDocument();
  });

  it('marks category shortfalls in the alert, project row, and source row despite a positive overall balance', async () => {
    const draft = plan();
    draft.content.appointments = [];
    draft.content.fundingSources = draft.content.fundingSources.slice(0, 2);
    draft.content.fundingSources[0].projectType = 'Sponsored';
    draft.content.fundingSources[0].budgets[0].budget = 500;
    const { onViewCategoryBalances, user } = await show(draft);
    const summary = screen.getByRole('region', { name: 'Funding summary' });
    expect(summary).toHaveTextContent(
      'First category budget shortfall: Jan 2026'
    );
    expect(
      within(summary).getByRole('list', { name: 'Categories with a shortfall' })
    ).toHaveTextContent('Supplies / Services / Other Expenses');
    expect(summary).not.toHaveTextContent('source falls below zero');
    expect(summary).toHaveTextContent(
      'These category balances recover by plan end.'
    );
    expect(
      screen.queryByText('Each funding source stays within funding')
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Outlook totals')).toHaveTextContent('$1,500');
    await user.click(
      within(summary).getByRole('button', {
        name: 'View category balances for Source 1 · Task 1',
      })
    );
    expect(onViewCategoryBalances).toHaveBeenLastCalledWith(1);
    const table = screen.getByRole('table', { name: 'Funding sources' });
    expect(table).toHaveTextContent('1 task has category shortfalls');
    expect(table).not.toHaveTextContent('Within funding');
    await user.click(
      within(table).getByRole('button', { name: /Field research/ })
    );
    const warning = within(table).getByRole('button', {
      name: 'View category shortfalls for Source 1 · Task 1',
    });
    expect(warning).toHaveTextContent('Recovers by plan end');
    await user.hover(warning);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      SUPPLIES_CATEGORY
    );
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Recovers in Feb 2026 and stays within budget through plan end.'
    );
    await user.click(warning);
    expect(onViewCategoryBalances).toHaveBeenLastCalledWith(1);
  });

  it('avoids an all-clear message in a selected source with a category deficit', async () => {
    const draft = plan();
    draft.content.fundingSources[0].projectType = 'Sponsored';
    draft.content.fundingSources[0].budgets[0].budget = 500;
    await show(draft, 1);
    expect(
      screen.queryByText('Stays within funding throughout this plan')
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'View category shortfalls for Source 1 · Task 1',
      })
    ).toBeInTheDocument();
  });

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
    expect(within(table).getByText('$1,050')).toBeInTheDocument();
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

  it('lists future funding without including its balance or drawing a line', async () => {
    const { onNavigate, user } = await show();
    expect(screen.getByLabelText('Outlook totals')).not.toHaveTextContent(
      '$5,000'
    );
    expect(chartLines()).toHaveLength(0);
    expect(
      screen.getByRole('table', { name: 'Funding sources' })
    ).toHaveTextContent('Future grant');
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
    await show(draft);
    const row = screen
      .getByRole('button', { name: 'View Source 4 · Task 4' })
      .closest('tr')!;
    expect(row).toHaveTextContent('No forecast data in this period');
    expect(row).not.toHaveTextContent('Outside forecast period');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
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

  it('shows a chart for a selected source and restores only the table on return', async () => {
    const { draft, onNavigate, rerender, results, user } = await show();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: 'Funding sources' })
    ).toBeInTheDocument();
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
      screen.getByRole('heading', { name: 'Source 1 · Task 1' })
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
    expect(chartLines()).toHaveLength(0);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: 'Funding sources' })
    ).toBeInTheDocument();
  });
});
