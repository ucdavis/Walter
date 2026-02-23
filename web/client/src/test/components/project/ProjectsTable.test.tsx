import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ProjectsTable } from '@/components/project/ProjectsTable.tsx';
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
  awardNumber: 'AWD001',
  awardPi: null,
  awardStartDate: '2024-01-01',
  awardStatus: null,
  awardType: null,
  billingCycle: null,
  catBudBal: 4000,
  catBudget: 10000,
  catCommitments: 1000,
  catItdExp: 5000,
  contractAdministrator: null,
  copi: null,
  costShareRequiredBySponsor: null,
  displayName: 'P1: Test Project',
  expenditureCategoryName: 'Personnel',
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
  projectStatusCode: 'ACTIVE',
  projectType: 'Sponsored',
  purposeDesc: 'Research',
  sponsorAwardNumber: null,
  taskName: 'Task 1',
  taskNum: 'T001',
  taskStatus: 'OPEN',
  ...overrides,
});

describe('ProjectsTable', () => {
  it('shows empty state when no projects', () => {
    render(<ProjectsTable employeeId="123" records={[]} />);

    expect(screen.getByText('No projects found.')).toBeInTheDocument();
  });

  // Note: Expired/inactive project filtering is handled at the API level

  it('renders totals row', () => {
    const projects = [
      createProject({ projectNumber: 'P1', projectName: 'Project One' }),
      createProject({ projectNumber: 'P2', projectName: 'Project Two' }),
    ];

    render(<ProjectsTable employeeId="123" records={projects} />);

    expect(screen.getByText('Totals')).toBeInTheDocument();
  });

  it('shows warning icon when project has reconciliation discrepancy', () => {
    const projects = [createProject({ projectNumber: 'P1' })];

    render(
      <ProjectsTable
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
    const projects = [createProject({ projectNumber: 'P1' })];

    render(
      <ProjectsTable
        discrepancies={new Set()}
        employeeId="123"
        records={projects}
      />
    );

    expect(
      screen.queryByTitle('GL/PPM reconciliation discrepancy')
    ).not.toBeInTheDocument();
  });
});
