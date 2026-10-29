import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ExpenseEditor,
  FundingEditor,
} from '@/components/guidedProjections/PlanEditors.tsx';
import SplitStaffEditor from '@/components/guidedProjections/SplitStaffEditor.tsx';
import {
  fromServerProjection,
  toServerProjection,
} from '@/components/guidedProjections/serverPlan.ts';
import type { ProjectionPlan } from '@/components/guidedProjections/planModel.ts';
import type { Projection } from '@/queries/projections.ts';

afterEach(cleanup);

function fixture(): Projection {
  return {
    createdAt: '2026-10-29T12:00:00Z',
    createdBy: null,
    historyMonths: 6,
    id: 12,
    jobs: [
      {
        cbrRate: null,
        colaMonth: 7,
        colaRate: 0.03,
        employeeId: '12345678',
        endDate: null,
        feeRemissionMonthly: 100,
        fte: 0.5,
        fundingEntries: [
          {
            endDate: null,
            isSeeded: true,
            percent: 0.6,
            projectId: 1,
            startDate: null,
          },
          {
            endDate: null,
            isSeeded: true,
            percent: 0.4,
            projectId: null,
            startDate: null,
          },
        ],
        id: 1,
        isSeeded: true,
        jobCode: '123',
        monthlySalary: null,
        name: 'Alex Researcher',
        positionNumber: '321',
        rateSet: 'DVCMP',
        startDate: null,
        title: 'Researcher',
        vacationAccrualRate: 0.08,
      },
    ],
    name: 'Research plan',
    piEmployeeId: '87654321',
    projects: [
      {
        actuals: [],
        awardName: null,
        awardNumber: null,
        budgets: [
          {
            budget: 10_000,
            committed: 1000,
            expenditureCategory: 'Supplies',
            isSeeded: true,
            spentToDate: 2000,
          },
        ],
        endDate: '2027-12-31',
        expenses: [
          {
            amount: 500,
            description: null,
            endMonth: null,
            expenditureCategory: 'Supplies',
            kind: 'Projected',
            startMonth: null,
          },
        ],
        id: 1,
        isSeeded: true,
        projectName: 'Lab project',
        projectNumber: 'A123',
        projectType: 'Sponsored',
        runRates: [],
        startDate: '2025-01-01',
        taskName: 'Lab',
        taskNumber: '01',
      },
    ],
    seededAt: '2026-10-29T12:00:00Z',
    updatedAt: '2026-10-29T12:00:00Z',
    updatedBy: null,
  };
}

function renderEditor(editor: 'staff' | 'expenses' | 'funding') {
  let latest: ProjectionPlan = fromServerProjection(fixture());
  function Editor() {
    const [plan, setPlan] = useState(latest);
    const update = (next: ProjectionPlan) => {
      latest = next;
      setPlan(next);
    };
    return editor === 'staff' ? (
      <SplitStaffEditor
        lookups={{
          expenditureCategories: [],
          jobCodes: [
            {
              cbr: 0.3,
              jobCode: '456',
              rateSet: 'DVCMP',
              title: 'New researcher',
              vacationAccrual: 0.09,
            },
          ],
        }}
        plan={plan}
        update={update}
      />
    ) : editor === 'expenses' ? (
      <ExpenseEditor plan={plan} update={update} />
    ) : (
      <FundingEditor plan={plan} update={update} />
    );
  }
  render(<Editor />);
  return () => toServerProjection(latest);
}

describe('Live guided projection editors', () => {
  it('keeps outside funding and appointment funding proportions when FTE changes', () => {
    const saved = renderEditor('staff');
    expect(screen.getByLabelText('Alex Researcher share 1')).toHaveValue(30);
    expect(
      screen.getByLabelText('Alex Researcher project 2')
    ).toHaveDisplayValue('Outside portfolio');
    fireEvent.click(screen.getByText('Salary & person details'));
    fireEvent.change(screen.getByLabelText('Appointment FTE'), {
      target: { value: '0.75' },
    });
    expect(screen.getByLabelText('Alex Researcher share 1')).toHaveValue(45);
    expect(screen.getByLabelText('Alex Researcher share 2')).toHaveValue(30);
    expect(
      saved().jobs[0].fundingEntries.map((entry) => entry.percent)
    ).toEqual([0.6, 0.4]);
    expect(saved().jobs[0].fundingEntries[1].projectId).toBeNull();
  });

  it('keeps missing pay inputs blank and applies the selected job-code rates', () => {
    const saved = renderEditor('staff');
    fireEvent.click(screen.getByText('Salary & person details'));
    expect(screen.getByLabelText('Annual full-time salary')).toHaveValue(null);
    expect(screen.getByLabelText('CBR %')).toHaveValue(null);
    fireEvent.change(screen.getByLabelText('Annual full-time salary'), {
      target: { value: '72000' },
    });
    fireEvent.change(screen.getByLabelText('Job code and rate set'), {
      target: { value: 'DVCMP|456' },
    });
    fireEvent.change(screen.getByLabelText('Appointment ends'), {
      target: { value: '2027-05-15' },
    });
    expect(saved().jobs[0]).toMatchObject({
      cbrRate: 0.3,
      endDate: '2027-05-15',
      jobCode: '456',
      monthlySalary: 6000,
      vacationAccrualRate: 0.09,
    });
    fireEvent.change(screen.getByLabelText('CBR %'), { target: { value: '' } });
    expect(saved().jobs[0].cbrRate).toBeNull();
  });

  it('turns a run-rate estimate into a bounded planned expense without losing its category', () => {
    const saved = renderEditor('expenses');
    expect(
      screen.getByText(/Based on the 6-month spending average/)
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Ending month'), {
      target: { value: '2027-03' },
    });
    fireEvent.change(screen.getByLabelText('Expenditure category'), {
      target: { value: 'Travel' },
    });
    expect(saved().projects[0].expenses[0]).toMatchObject({
      amount: 500,
      endMonth: '2027-03-01',
      expenditureCategory: 'Travel',
      kind: 'Monthly',
    });
    expect(
      screen.queryByText(/Based on the 6-month spending average/)
    ).not.toBeInTheDocument();
  });

  it('retains a negative available balance without changing the seeded budget rows', () => {
    const saved = renderEditor('funding');
    fireEvent.change(screen.getByLabelText('Lab project starting balance'), {
      target: { value: '-2500' },
    });
    expect(saved().projects[0].budgets[0]).toEqual(
      fixture().projects[0].budgets[0]
    );
    expect(
      saved().projects[0].budgets.reduce(
        (sum, row) => sum + row.budget - row.committed - row.spentToDate,
        0
      )
    ).toBe(-2500);
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    expect(screen.queryByLabelText('Indirect rate %')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Description')).not.toBeInTheDocument();
  });
});
