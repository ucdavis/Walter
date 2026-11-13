import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectionReviewStep } from '@/components/projections/ProjectionReviewStep.tsx';
import { createSalaryExample } from '@/test/fixtures/projections.ts';
import { computePiProjection, SUPPLIES_CATEGORY } from '@/lib/piProjection.ts';

afterEach(cleanup);

function example() {
  const draft = createSalaryExample();
  const [short, surplus] = draft.content.fundingSources;
  short.projectNumber = surplus.projectNumber = 'P1';
  short.projectName = surplus.projectName = 'Research';
  short.taskNumber = '1';
  surplus.taskNumber = '2';
  short.budgets[0].budget = short.budgets[0].spentToDate + 50;
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
  const appointment = draft.content.appointments[0];
  appointment.monthlySalary = 0;
  appointment.allocations = [
    { endDate: null, fundingSourceId: short.id, percent: 0.5, startDate: null },
  ];
  draft.content.appointments.push({
    ...structuredClone(appointment),
    allocations: [
      {
        endDate: null,
        fundingSourceId: short.id,
        percent: 1.25,
        startDate: null,
      },
    ],
    id: 102,
    name: 'Blair Example',
  });
  return draft;
}

function show(draft = example()) {
  render(
    <ProjectionReviewStep
      disabled={false}
      draft={draft}
      name={draft.name}
      notes=""
      onEditStep={vi.fn()}
      onNotesChange={vi.fn()}
      results={computePiProjection(draft)}
    />
  );
  return userEvent.setup();
}

describe('minimal setup review', () => {
  it('keeps recovered task shortfalls and staffing issues visible with source details collapsed', async () => {
    const user = show();
    const totals = screen.getByLabelText('Outlook totals');
    expect(totals).toHaveTextContent('$16,050.00');
    const issues = screen.getByRole('region', { name: 'Items to review' });
    expect(issues).toHaveTextContent(
      '1 funding source falls below zero, first in Jan 2026.'
    );
    expect(issues).toHaveTextContent('1 appointment has unallocated time.');
    expect(issues).toHaveTextContent(
      '1 appointment has overlapping allocations.'
    );
    expect(issues).toHaveTextContent('You can create this plan');
    expect(screen.getByRole('table')).not.toBeVisible();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    await user.click(screen.getByText('Funding source details (2)'));
    const table = screen.getByRole('table', {
      name: 'Funding source balances at Dec 2026',
    });
    const shortfall = within(table)
      .getByText('Project A · Task 1')
      .closest('tr')!;
    expect(shortfall).toHaveTextContent(
      'First shortfall Jan 2026. Recovers by plan end.'
    );
    expect(shortfall).toHaveTextContent('$50.00');
  });

  it('distinguishes future funding from sources with no financial data without inventing zero balances', async () => {
    const draft = example();
    draft.content.appointments = [];
    const [future, empty] = draft.content.fundingSources;
    future.startDate = '2028-01-01';
    future.endDate = null;
    future.expenses = [];
    empty.actuals = [];
    empty.budgets = [];
    const user = show(draft);
    expect(
      screen.queryByRole('region', { name: 'Items to review' })
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Outlook totals')).toHaveTextContent(
      'No contribution in this period'
    );
    await user.click(screen.getByText('Funding source details (2)'));
    const table = screen.getByRole('table');
    const futureRow = within(table)
      .getByText('Project A · Task 1')
      .closest('tr')!;
    const emptyRow = within(table)
      .getByText('Project B · Task 2')
      .closest('tr')!;
    expect(futureRow).toHaveTextContent('Outside forecast period');
    expect(emptyRow).toHaveTextContent('No forecast data in this period');
    for (const row of [futureRow, emptyRow]) {
      expect(row).toHaveTextContent('Not included');
      expect(row).not.toHaveTextContent('$0.00');
    }
  });
});
