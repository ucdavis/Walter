import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ChartStringBreakdown } from '@/components/project/ChartStringBreakdown.tsx';
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

describe('ChartStringBreakdown', () => {
  it('opens a drawer for the Commitments table header', async () => {
    const user = userEvent.setup();
    render(
      <ChartStringBreakdown
        employeeId="123"
        projectNumber="P1"
        records={[createProject()]}
      />
    );

    const commitmentsHeader = screen.getByRole('columnheader', {
      name: /commitments/i,
    });
    const commitmentsTrigger = screen.getByRole('button', {
      name: 'Open Commitments help',
    });

    expect(commitmentsHeader).toBeInTheDocument();
    expect(commitmentsTrigger).toHaveAttribute('aria-haspopup', 'dialog');

    await user.click(commitmentsTrigger);

    expect(await screen.findByRole('dialog', { name: 'Commitments' })).toHaveTextContent(
      tooltipDefinitions.commitment
    );
  });

  it('keeps sorting behavior on the Commitments header text', async () => {
    const user = userEvent.setup();
    render(
      <ChartStringBreakdown
        employeeId="123"
        projectNumber="P1"
        records={[
          createProject({ commitments: 400, taskNum: 'T002' }),
          createProject({ commitments: 1000, taskNum: 'T001' }),
        ]}
      />
    );

    const commitmentsHeader = screen.getByRole('columnheader', {
      name: /commitments/i,
    });

    await user.click(commitmentsHeader);

    expect(
      screen.queryByRole('dialog', { name: 'Commitments' })
    ).not.toBeInTheDocument();
    expect(
      within(commitmentsHeader).getByLabelText(/sorted/i)
    ).toBeInTheDocument();
  });

  it('opens a drawer for the Balance table header', async () => {
    const user = userEvent.setup();
    render(
      <ChartStringBreakdown
        employeeId="123"
        projectNumber="P1"
        records={[createProject()]}
      />
    );

    const balanceHeader = screen.getAllByRole('columnheader', { name: /balance/i })[0];
    const balanceTrigger = screen.getAllByRole('button', {
      name: 'Open Balance help',
    })[0];

    expect(balanceHeader).toBeInTheDocument();
    expect(balanceTrigger).toHaveAttribute('aria-haspopup', 'dialog');

    await user.click(balanceTrigger);

    expect(await screen.findByRole('dialog', { name: 'Balance' })).toHaveTextContent(
      tooltipDefinitions.balance
    );
  });

  it('does not sort the column when dismissing header help', async () => {
    const user = userEvent.setup();
    render(
      <ChartStringBreakdown
        employeeId="123"
        projectNumber="P1"
        records={[createProject()]}
      />
    );

    const commitmentsHeader = screen.getByRole('columnheader', {
      name: /commitments/i,
    });

    await user.click(screen.getByRole('button', { name: 'Open Commitments help' }));
    expect(
      await screen.findByRole('dialog', { name: 'Commitments' })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dismiss Commitments help' }));

    expect(
      screen.queryByRole('dialog', { name: 'Commitments' })
    ).not.toBeInTheDocument();
    expect(
      within(commitmentsHeader).queryByLabelText(/sorted/i)
    ).not.toBeInTheDocument();
  });
});
