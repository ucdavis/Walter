import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { TaskBreakdown } from '@/components/project/TaskBreakdown.tsx';
import { downloadExcelCsv } from '@/lib/csv.ts';
import type { ProjectRecord } from '@/queries/project.ts';
import { tooltipDefinitions } from '@/shared/tooltips.ts';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

vi.mock('@/lib/csv.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/csv.ts')>();

  return {
    ...actual,
    downloadExcelCsv: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.mocked(downloadExcelCsv).mockClear();
});

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
  taskStatus: 'Active',
  ...overrides,
});

describe('TaskBreakdown', () => {
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

  it('shows the filtered export action only when a search filter is active', () => {
    render(
      <TaskBreakdown
        employeeId="123"
        projectNumber="P1"
        records={[
          createProject({
            activityCode: 'SUN',
            activityDesc: 'Sunny Activity',
            taskName: 'Sunny Task',
            taskNum: 'T001',
          }),
          createProject({
            activityCode: 'RAIN',
            activityDesc: 'Rainy Activity',
            fundCode: 'FUND2',
            programCode: 'PROG2',
            taskName: 'Rainy Task',
            taskNum: 'T002',
          }),
        ]}
      />
    );

    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Export filtered' })
    ).not.toBeInTheDocument();

    fireEvent.input(screen.getByPlaceholderText('Search all columns...'), {
      target: { value: 'SUN' },
    });

    expect(
      screen.getByRole('button', { name: 'Export filtered' })
    ).toBeInTheDocument();
  });

  it('exports only filtered task breakdown rows when the filtered export button is used', () => {
    render(
      <TaskBreakdown
        employeeId="123"
        projectNumber="P1"
        records={[
          createProject({
            activityCode: 'SUN',
            activityDesc: 'Sunny Activity',
            taskName: 'Sunny Task',
            taskNum: 'T001',
          }),
          createProject({
            activityCode: 'RAIN',
            activityDesc: 'Rainy Activity',
            fundCode: 'FUND2',
            programCode: 'PROG2',
            taskName: 'Rainy Task',
            taskNum: 'T002',
          }),
        ]}
      />
    );

    fireEvent.input(screen.getByPlaceholderText('Search all columns...'), {
      target: { value: 'SUN' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Export filtered' }));

    expect(downloadExcelCsv).toHaveBeenCalledTimes(1);

    const csv = vi.mocked(downloadExcelCsv).mock.calls[0]?.[0];
    const filename = vi.mocked(downloadExcelCsv).mock.calls[0]?.[1];

    expect(csv).toContain('Sunny Task');
    expect(csv).toContain('SUN');
    expect(csv).not.toContain('Rainy Task');
    expect(csv).not.toContain('RAIN');
    expect(filename).toBe('task-breakdown-P1-filtered.csv');
  });
});
