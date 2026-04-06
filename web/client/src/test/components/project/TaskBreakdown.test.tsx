import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { TaskBreakdown } from '@/components/project/TaskBreakdown.tsx';
import type { ProjectRecord } from '@/queries/project.ts';
import { tooltipDefinitions } from '@/shared/tooltips.ts';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

afterEach(cleanup);

const createProject = (
  overrides: Partial<ProjectRecord> = {}
): ProjectRecord => ({
  activityCode: null,
  activityDesc: 'Activity',
  awardCloseDate: null,
  awardEndDate: '2099-12-31',
  awardName: null,
  awardNumber: 'AWD001',
  awardPi: null,
  awardStartDate: '2024-01-01',
  awardStatus: null,
  awardType: null,
  balance: 4000,
  billingCycle: null,
  budget: 10_000,
  commitments: 1000,
  contractAdministrator: null,
  copi: null,
  costShareRequiredBySponsor: null,
  displayName: 'P1: Test Project',
  expenditureCategoryName: null,
  expenses: 5000,
  fundCode: 'FUND1',
  fundDesc: 'Federal',
  grantAdministrator: null,
  pa: null,
  pi: 'PI Name',
  pm: null,
  pmEmployeeId: null,
  postReportingPeriod: null,
  ppmBudBal: 4000,
  ppmBudget: 10_000,
  ppmCommitments: 1000,
  ppmExpenses: 5000,
  primarySponsorName: null,
  programCode: 'PROG1',
  programDesc: 'Program',
  projectBurdenCostRate: null,
  projectBurdenScheduleBase: null,
  projectFund: null,
  projectName: 'Test Project',
  projectNumber: 'P1',
  projectOwningOrg: 'ORG001',
  projectOwningOrgCode: 'ORG001',
  projectStatusCode: 'ACTIVE',
  projectType: 'Sponsored',
  purposeDesc: 'Research',
  sponsorAwardNumber: null,
  taskName: 'Task 1',
  taskNum: 'T001',
  taskStatus: 'OPEN',
  ...overrides,
});

describe('TaskBreakdown', () => {
  it('shows a tooltip for the Expenditure Category table header', async () => {
    const user = userEvent.setup();
    render(
      <TaskBreakdown
        employeeId="123"
        projectNumber="P1"
        records={[createProject()]}
      />
    );

    const label = screen.getByText('Expenditure Category');
    await user.hover(label.parentElement as HTMLElement);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      tooltipDefinitions.expenditureCategory
    );
  });

  it('shows a tooltip for the Commitments table header', async () => {
    const user = userEvent.setup();
    render(
      <TaskBreakdown
        employeeId="123"
        projectNumber="P1"
        records={[createProject()]}
      />
    );

    const commitmentsLabel = screen.getByText('Commitments');
    const commitmentsTrigger = commitmentsLabel.parentElement as HTMLElement;

    expect(commitmentsTrigger).toHaveAttribute(
      'data-tooltip-placement',
      'bottom'
    );
    expect(commitmentsTrigger).toHaveAttribute('tabIndex', '0');
    expect(commitmentsLabel).toHaveClass('tooltip-label');

    await user.hover(commitmentsTrigger);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      tooltipDefinitions.commitment
    );
  });

  it('shows a tooltip for the Balance table header', async () => {
    const user = userEvent.setup();
    render(
      <TaskBreakdown
        employeeId="123"
        projectNumber="P1"
        records={[createProject()]}
      />
    );

    const balanceHeaders = screen.getAllByText('Balance');
    const balanceLabel = balanceHeaders[0];
    const balanceTrigger = balanceLabel.parentElement as HTMLElement;

    expect(balanceTrigger).toHaveAttribute('data-tooltip-placement', 'bottom');
    expect(balanceTrigger).toHaveAttribute('tabIndex', '0');
    expect(balanceLabel).toHaveClass('tooltip-label');

    await user.hover(balanceTrigger);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      tooltipDefinitions.balance
    );
  });
});
