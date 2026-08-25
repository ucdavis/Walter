import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { TaskBreakdown } from '@/components/project/TaskBreakdown.tsx';
import type { ProjectRecord } from '@/queries/project.ts';

afterEach(() => {
  cleanup();
});

const createRecord = (
  overrides: Partial<ProjectRecord> = {}
): ProjectRecord => ({
  activityCode: null,
  activityDesc: '',
  awardCloseDate: null,
  awardEndDate: null,
  awardName: null,
  awardNumber: null,
  awardPi: null,
  awardStartDate: null,
  awardStatus: null,
  awardType: null,
  balance: 100,
  billingCycle: null,
  budget: 300,
  commitments: 50,
  contractAdministrator: null,
  copi: null,
  costShareRequiredBySponsor: null,
  displayName: 'Test Project',
  expenditureCategoryName: null,
  expenses: 150,
  flowThroughFundsAmount: null,
  flowThroughFundsEndDate: null,
  flowThroughFundsPrimarySponsor: null,
  flowThroughFundsReferenceAwardName: null,
  flowThroughFundsStartDate: null,
  fundCode: '13U00',
  fundDesc: 'Test Fund',
  grantAdministrator: null,
  ownerName: null,
  pa: null,
  pi: null,
  pm: null,
  pmEmployeeId: null,
  postReportingPeriod: null,
  ppmBudBal: 0,
  ppmBudget: 0,
  ppmCommitments: 0,
  ppmExpenses: 0,
  primarySponsorName: null,
  programCode: null,
  programDesc: '',
  projectBurdenCostRate: null,
  projectBurdenScheduleBase: null,
  projectFund: null,
  projectName: 'Test Project',
  projectNumber: 'K30PROJ1',
  projectOwningOrg: 'Test Department',
  projectOwningOrgCode: 'TESTDEP',
  projectStatusCode: 'ACTIVE',
  projectType: 'Internal',
  purposeDesc: '',
  sponsorAwardNumber: null,
  taskName: 'Active Task',
  taskNum: '441000',
  taskStatus: 'Active',
  ...overrides,
});

const renderTable = (records: ProjectRecord[]) =>
  render(
    <TaskBreakdown isInternal projectNumber="K30PROJ1" records={records} />
  );

describe('TaskBreakdown', () => {
  it('hides closed and zero-balance tasks by default', () => {
    renderTable([
      createRecord({ taskNum: '441000' }),
      createRecord({ taskNum: '442000', taskStatus: 'Inactive' }),
      createRecord({
        balance: 0,
        budget: 0,
        commitments: 0,
        expenses: 0,
        taskNum: '443000',
      }),
    ]);

    expect(screen.getByText('441000')).toBeInTheDocument();
    expect(screen.queryByText('442000')).not.toBeInTheDocument();
    expect(screen.queryByText('443000')).not.toBeInTheDocument();
  });

  it('keeps a fully spent task visible', () => {
    renderTable([
      createRecord({
        balance: 0,
        budget: 100,
        commitments: 0,
        expenses: 100,
        taskNum: '444000',
      }),
    ]);

    expect(screen.getByText('444000')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /show hidden tasks/i })
    ).not.toBeInTheDocument();
  });

  it('treats sub-cent residue as zero when filtering', () => {
    renderTable([
      createRecord({ taskNum: '441000' }),
      createRecord({
        balance: 0.001,
        budget: 0.001,
        commitments: 0,
        expenses: 0,
        taskNum: '445000',
      }),
    ]);

    expect(screen.queryByText('445000')).not.toBeInTheDocument();
  });

  it('reveals hidden tasks with the show all toggle and marks closed tasks', async () => {
    const user = userEvent.setup();
    renderTable([
      createRecord({ taskNum: '441000' }),
      createRecord({ taskNum: '442000', taskStatus: 'Inactive' }),
      createRecord({
        balance: 0,
        budget: 0,
        commitments: 0,
        expenses: 0,
        taskNum: '443000',
      }),
    ]);

    const toggle = screen.getByRole('button', { name: /show hidden tasks/i });
    expect(toggle).toHaveTextContent('Show hidden tasks (2)');

    await user.click(toggle);

    expect(screen.getByText('442000')).toBeInTheDocument();
    expect(screen.getByText('443000')).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /hide closed & zero balance/i })
    ).toBeInTheDocument();
  });

  it('does not show the toggle when no tasks are hidden', () => {
    renderTable([createRecord({ taskNum: '441000' })]);

    expect(
      screen.queryByRole('button', { name: /show hidden tasks/i })
    ).not.toBeInTheDocument();
  });

  it('excludes hidden tasks from totals', () => {
    renderTable([
      createRecord({
        balance: 100,
        budget: 300,
        commitments: 50,
        expenses: 150,
        taskNum: '441000',
      }),
      createRecord({
        balance: 500,
        budget: 500,
        commitments: 0,
        expenses: 0,
        taskNum: '442000',
        taskStatus: 'Inactive',
      }),
    ]);

    // Footer totals reflect only the visible active task.
    expect(screen.getAllByText('$300.00')).toHaveLength(2);
    expect(screen.queryByText('$800.00')).not.toBeInTheDocument();
  });
});
