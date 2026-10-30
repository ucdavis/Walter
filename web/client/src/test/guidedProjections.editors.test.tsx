import { useState } from 'react';
import { userEvent } from '@testing-library/user-event';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ExpenseEditor,
  FundingEditor,
} from '@/components/guidedProjections/PlanEditors.tsx';
import SplitStaffEditor from '@/components/guidedProjections/SplitStaffEditor.tsx';
import {
  fromServerProjection,
  toServerProjection,
} from '@/components/guidedProjections/serverPlan.ts';
import { allocationInMonth } from '@/components/guidedProjections/staffAllocation.ts';
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

function renderEditor(
  editor: 'staff' | 'expenses' | 'funding',
  initial = fixture()
) {
  let latest: ProjectionPlan = fromServerProjection(initial);
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
  return Object.assign(() => toServerProjection(latest), {
    plan: () => latest,
  });
}

describe('Live guided projection editors', () => {
  it('reveals a newly added expense and focuses its name', async () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
    try {
      renderEditor('expenses');
      fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
      const input = screen.getAllByLabelText('Expense name').at(-1)!;
      await waitFor(() => expect(input).toHaveFocus());
      expect(
        scroll.mock.contexts.some((element) =>
          (element as Element).contains(input)
        )
      ).toBe(true);
    } finally {
      scroll.mockRestore();
    }
  });

  it.each([
    {
      add: 'Add funding source',
      button: 'Edit details',
      editor: 'funding' as const,
      name: 'Planned funding source',
    },
    {
      add: 'Add person',
      button: 'Salary & person details',
      editor: 'staff' as const,
      name: 'Planned hire',
    },
  ])(
    'reveals the new $name after closing its modal',
    async ({ add, button, editor, name }) => {
      const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
      try {
        renderEditor(editor);
        fireEvent.click(screen.getByRole('button', { name: add }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
        const card = screen.getByText(name).closest('article')!;
        await waitFor(() =>
          expect(
            within(card).getByRole('button', { name: button })
          ).toHaveFocus()
        );
        expect(scroll.mock.contexts).toContain(card);
      } finally {
        scroll.mockRestore();
      }
    }
  );

  it('warns on a filled block when funds run out, without warning for ended projects or outside funding', async () => {
    const user = userEvent.setup();
    const initial = fixture();
    initial.projects[0].budgets[0].budget = 4200;
    initial.projects[0].expenses[0].amount = 1200;
    initial.projects[0].expenses[0].kind = 'OneTime';
    initial.projects[0].expenses[0].startMonth = '2026-11-01';
    initial.projects[0].endDate = '2026-11-30';
    initial.jobs[0].monthlySalary = 0;
    initial.jobs[0].cbrRate = 0;
    initial.jobs[0].feeRemissionMonthly = 0;
    renderEditor('staff', initial);
    expect(
      screen.getByRole('button', { name: /Alex Researcher, Oct 2026:/ })
    ).not.toHaveAccessibleName(/funding exhausted/);
    const exhausted = screen.getByRole('button', {
      name: /Alex Researcher, Nov 2026: 30% Lab project \(funding exhausted\), 20% Outside portfolio/,
    });
    await user.hover(within(exhausted).getByText('30%').parentElement!);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Funding exhausted');
    expect(tooltip).toHaveTextContent('Projected month-end balance$0');
    const ended = screen.getByRole('button', {
      name: /Alex Researcher, Dec 2026:/,
    });
    expect(ended).not.toHaveAccessibleName(/funding exhausted/);
    expect(within(ended).queryByText('30%')).not.toBeInTheDocument();
  });

  it('shows project details in a card tooltip when hovering a staffing month', async () => {
    const user = userEvent.setup();
    const initial = fixture();
    initial.projects[0].awardNumber = 'AWD123';
    initial.projects[0].awardName = 'Research award';
    renderEditor('staff', initial);
    const month = screen.getByRole('button', {
      name: /Alex Researcher, Oct 2026:/,
    });
    const project = within(month).getByText('30%').parentElement!;
    await user.hover(project);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Lab project');
    expect(tooltip).toHaveTextContent('Oct 2026');
    expect(tooltip).toHaveTextContent('Funding share30%');
    expect(tooltip).toHaveTextContent('Project numberA123');
    expect(tooltip).toHaveTextContent('Project typeSponsored');
    expect(tooltip).toHaveTextContent('AwardAWD123 · Research award');
    expect(tooltip).toHaveTextContent('Task01 · Lab');
    expect(tooltip).toHaveTextContent('01.01.2025 – 12.31.2027');
    expect(tooltip).toHaveTextContent('Available balance$7,000');
    await user.unhover(project);
    await waitFor(() =>
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    );
    await user.hover(within(month).getByText('20%').parentElement!);
    const outside = await screen.findByRole('tooltip');
    expect(outside).toHaveTextContent('Outside portfolio');
    expect(outside).toHaveTextContent('Funding share20%');
    expect(outside).toHaveTextContent(
      'does not charge the projects in this plan'
    );
    expect(
      within(outside).queryByText('Available balance')
    ).not.toBeInTheDocument();
  });

  it('edits one month in a modal without changing adjacent months', () => {
    renderEditor('staff');
    const timeline = screen.getByRole('region', {
      name: 'Alex Researcher monthly funding',
    });
    expect(within(timeline).getAllByRole('button')).toHaveLength(12);
    fireEvent.change(screen.getByLabelText('Planning period'), {
      target: { value: '6' },
    });
    expect(within(timeline).getAllByRole('button')).toHaveLength(6);
    fireEvent.change(screen.getByLabelText('Planning period'), {
      target: { value: '18' },
    });
    expect(within(timeline).getAllByRole('button')).toHaveLength(18);
    expect(
      screen.getByRole('button', {
        name: /Alex Researcher, Oct 2026: 30% Lab project, 20% Outside portfolio/,
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Alex Researcher share 1')
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: /Alex Researcher, Oct 2026: 30% Lab project/,
      })
    );
    expect(
      screen.getByRole('dialog', { name: 'Alex Researcher allocation' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Start month')).toHaveValue('2026-10');
    expect(screen.getByLabelText('End month')).toHaveValue('2026-10');
    fireEvent.change(screen.getByLabelText('Alex Researcher share 1'), {
      target: { value: '10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Replace 1 month' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /Alex Researcher, Oct 2026: 10% Lab project, 20% Outside portfolio, 20% open/,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /Alex Researcher, Nov 2026: 30% Lab project, 20% Outside portfolio/,
      })
    ).toBeInTheDocument();
  });

  it('cancels allocation drafts and replaces only the selected range after saving', () => {
    const saved = renderEditor('staff');
    const original = saved();
    const open = () =>
      fireEvent.click(
        screen.getByRole('button', {
          name: /Alex Researcher, Dec 2026: 30% Lab project/,
        })
      );
    open();
    fireEvent.change(screen.getByLabelText('Alex Researcher share 1'), {
      target: { value: '10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(saved()).toEqual(original);
    open();
    fireEvent.change(screen.getByLabelText('Start month'), {
      target: { value: '2026-11' },
    });
    fireEvent.change(screen.getByLabelText('End month'), {
      target: { value: '2027-01' },
    });
    fireEvent.change(screen.getByLabelText('Alex Researcher share 1'), {
      target: { value: '10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Replace 3 months' }));
    const reloaded = fromServerProjection(saved());
    for (const month of ['2026-11', '2026-12', '2027-01']) {
      expect(
        allocationInMonth(reloaded.staff[0], month).map(
          (share) => share.percent
        )
      ).toEqual([10, 20]);
    }
    for (const month of ['2026-10', '2027-02', '2029-01']) {
      expect(
        allocationInMonth(reloaded.staff[0], month).map(
          (share) => share.percent
        )
      ).toEqual([30, 20]);
    }
  });

  it('adds and removes sources, blocks over-allocation, and allows clearing a month', () => {
    renderEditor('staff');
    fireEvent.click(
      screen.getByRole('button', { name: /Alex Researcher, Dec 2026:/ })
    );
    fireEvent.change(screen.getByLabelText('Alex Researcher share 1'), {
      target: { value: '40' },
    });
    expect(
      screen.getByRole('button', { name: 'Replace 1 month' })
    ).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Reduce them to 50% or less'
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove Alex Researcher funding share 2',
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add funding source' }));
    expect(
      screen.getByLabelText('Alex Researcher project 2')
    ).toHaveDisplayValue('Outside portfolio');
    expect(screen.getByLabelText('Alex Researcher share 2')).toHaveValue(10);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove Alex Researcher funding share 2',
      })
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove Alex Researcher funding share 1',
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Replace 1 month' }));
    expect(
      screen.getByRole('button', {
        name: /Alex Researcher, Dec 2026: 50% open/,
      })
    ).toBeInTheDocument();
  });

  it('keeps outside funding and appointment funding proportions when FTE changes', () => {
    const saved = renderEditor('staff');
    fireEvent.click(
      screen.getByRole('button', { name: /Alex Researcher, Oct 2026:/ })
    );
    expect(screen.getByLabelText('Alex Researcher share 1')).toHaveValue(30);
    expect(
      screen.getByLabelText('Alex Researcher project 2')
    ).toHaveDisplayValue('Outside portfolio');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Salary & person details' })
    );
    fireEvent.change(screen.getByLabelText('Appointment FTE'), {
      target: { value: '0.75' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    fireEvent.click(
      screen.getByRole('button', { name: /Alex Researcher, Oct 2026:/ })
    );
    expect(screen.getByLabelText('Alex Researcher share 1')).toHaveValue(45);
    expect(screen.getByLabelText('Alex Researcher share 2')).toHaveValue(30);
    expect(
      saved().jobs[0].fundingEntries.map((entry) => entry.percent)
    ).toEqual([0.6, 0.4]);
    expect(saved().jobs[0].fundingEntries[1].projectId).toBeNull();
  });

  it('keeps person details in a modal and discards canceled changes', () => {
    const saved = renderEditor('staff');
    const original = saved();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Salary & person details' })
    );
    expect(
      screen.getByRole('dialog', { name: 'Salary & person details' })
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Changed name' },
    });
    fireEvent.change(screen.getByLabelText('Appointment FTE'), {
      target: { value: '0.75' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(saved()).toEqual(original);
    fireEvent.click(
      screen.getByRole('button', { name: 'Salary & person details' })
    );
    expect(screen.getByLabelText('Name')).toHaveValue('Alex Researcher');
    expect(screen.getByLabelText('Appointment FTE')).toHaveValue(0.5);
    fireEvent(
      screen.getByRole('dialog'),
      new Event('cancel', { bubbles: true })
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(saved()).toEqual(original);
  });

  it('keeps missing pay inputs blank and applies the selected job-code rates', () => {
    const saved = renderEditor('staff');
    fireEvent.click(
      screen.getByRole('button', { name: 'Salary & person details' })
    );
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
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(saved().jobs[0]).toMatchObject({
      cbrRate: 0.3,
      endDate: '2027-05-15',
      jobCode: '456',
      monthlySalary: 6000,
      vacationAccrualRate: 0.09,
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Salary & person details' })
    );
    fireEvent.change(screen.getByLabelText('CBR %'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
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

  it('removes a funding source and its references while preserving other funding', () => {
    const initial = fixture();
    initial.projects.push({
      ...structuredClone(initial.projects[0]),
      id: 2,
      projectName: 'Other project',
      projectNumber: 'B456',
    });
    initial.jobs[0].fundingEntries[0].percent = 0.4;
    initial.jobs[0].fundingEntries.push({
      endDate: null,
      isSeeded: true,
      percent: 0.2,
      projectId: 2,
      startDate: null,
    });
    const saved = renderEditor('funding', initial);
    fireEvent.click(
      within(screen.getByRole('article', { name: 'Lab project' })).getByRole(
        'button',
        { name: 'Edit details' }
      )
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove funding source' })
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('article', { name: 'Lab project' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('article', { name: 'Other project' })
    ).toBeInTheDocument();
    expect(saved().projects.map((project) => project.id)).toEqual([2]);
    expect(
      saved().jobs[0].fundingEntries.map(({ percent, projectId }) => ({
        percent,
        projectId,
      }))
    ).toEqual([
      { percent: 0.4, projectId: null },
      { percent: 0.2, projectId: 2 },
    ]);
    expect(saved().settings?.selectedProjectIds).toEqual([2]);
    expect(saved.plan().expenses.map((expense) => expense.fundingId)).toEqual([
      'project-2',
    ]);
    expect(saved.plan().staff[0].fundingId).toBe('');
    expect(
      saved
        .plan()
        .staff[0].splits.some((split) => split.fundingId === 'project-1')
    ).toBe(false);
    expect(initial.projects).toHaveLength(2);
  });

  it('retains a negative available balance without changing the seeded budget rows', () => {
    const saved = renderEditor('funding');
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    fireEvent.change(screen.getByLabelText('Available balance'), {
      target: { value: '-2500' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      screen.getByLabelText('Lab project available balance')
    ).toHaveTextContent('-$2,500');
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
    expect(
      screen.getByRole('dialog', { name: 'Funding source details' })
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Funding source name'), {
      target: { value: 'Canceled name' },
    });
    fireEvent.change(screen.getByLabelText('Available balance'), {
      target: { value: '99999' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(saved().projects[0].projectName).toBe('Lab project');
    expect(
      screen.getByLabelText('Lab project available balance')
    ).toHaveTextContent('-$2,500');
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    fireEvent.change(screen.getByLabelText('Funding source name'), {
      target: { value: 'Revised source' },
    });
    fireEvent.change(screen.getByLabelText('End date'), {
      target: { value: '2028-06-30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(saved().projects[0]).toMatchObject({
      endDate: '2028-06-30',
      projectName: 'Revised source',
    });
    expect(saved().projects[0].budgets[0]).toEqual(
      fixture().projects[0].budgets[0]
    );
  });
});
