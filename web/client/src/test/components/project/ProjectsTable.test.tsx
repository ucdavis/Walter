import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { InternalProjectsTable } from '@/components/project/InternalProjectsTable.tsx';
import type { ProjectRecord } from '@/queries/project.ts';

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
  budget: 10000,
  commitments: 1000,
  expenses: 5000,
  ppmBudBal: 4000,
  ppmBudget: 10000,
  ppmCommitments: 1000,
  ppmExpenses: 5000,
  contractAdministrator: null,
  copi: null,
  costShareRequiredBySponsor: null,
  displayName: 'P1: Test Project',
  expenditureCategoryName: null,
  fundCode: null,
  fundDesc: 'Federal',
  grantAdministrator: null,
  pa: null,
  pi: 'PI Name',
  pm: null,
  pmEmployeeId: null,
  postReportingPeriod: null,
  primarySponsorName: null,
  programCode: null,
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

describe('InternalProjectsTable', () => {
  it('shows warning icon when project has reconciliation discrepancy', () => {
    const projects = [createProject({ projectNumber: 'P1', projectType: 'Internal' })];

    render(
      <InternalProjectsTable
        discrepancies={new Set(['P1'])}
        employeeId="123"
        records={projects}
      />
    );

    expect(
      screen.getByTitle('GL/PPM reconciliation discrepancy')
    ).toBeInTheDocument();
  });

  it('does not show warning icon when project has no discrepancy', () => {
    const projects = [createProject({ projectNumber: 'P1', projectType: 'Internal' })];

    render(
      <InternalProjectsTable
        discrepancies={new Set()}
        employeeId="123"
        records={projects}
      />
    );

    expect(
      screen.queryByTitle('GL/PPM reconciliation discrepancy')
    ).not.toBeInTheDocument();
  });

  it('shows separate rows for different tasks on the same project', () => {
    const projects = [
      createProject({ projectNumber: 'P1', projectType: 'Internal', taskNum: 'T001', taskName: 'Task One', budget: 5000, balance: 2000 }),
      createProject({ projectNumber: 'P1', projectType: 'Internal', taskNum: 'T002', taskName: 'Task Two', budget: 3000, balance: 1000 }),
    ];

    render(
      <InternalProjectsTable
        discrepancies={new Set()}
        employeeId="123"
        records={projects}
      />
    );

    expect(screen.getByText('T001')).toBeInTheDocument();
    expect(screen.getByText('T002')).toBeInTheDocument();
  });

  it('aggregates records with the same project and task into one row', () => {
    const projects = [
      createProject({ projectNumber: 'P1', projectType: 'Internal', taskNum: 'T001', budget: 5000, expenses: 1000, commitments: 500, balance: 3500 }),
      createProject({ projectNumber: 'P1', projectType: 'Internal', taskNum: 'T001', budget: 3000, expenses: 2000, commitments: 200, balance: 800 }),
    ];

    render(
      <InternalProjectsTable
        discrepancies={new Set()}
        employeeId="123"
        records={projects}
      />
    );

    // Should show one row, not two
    const cells = screen.getAllByText('T001');
    expect(cells).toHaveLength(1);
    // Summed budget $8,000.00 appears in the row and the totals footer
    expect(screen.getAllByText('$8,000.00').length).toBeGreaterThanOrEqual(1);
  });
});
