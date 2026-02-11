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
  awardEndDate: '2099-12-31',
  awardNumber: 'AWD001',
  awardStartDate: '2024-01-01',
  catBudBal: 4000,
  catBudget: 10000,
  catCommitments: 1000,
  catItdExp: 5000,
  copi: null,
  displayName: 'P1: Test Project',
  expenditureCategoryName: 'Personnel',
  fundCode: null,
  fundDesc: 'Federal',
  hasGlPpmDiscrepancy: false,
  managedByCurrentUser: false,
  pa: null,
  pi: 'PI Name',
  pm: null,
  pmEmployeeId: null,
  programCode: null,
  programDesc: 'Program',
  projectName: 'Test Project',
  projectNumber: 'P1',
  projectOwningOrg: 'ORG001',
  projectStatusCode: 'ACTIVE',
  projectType: 'Sponsored',
  purposeDesc: 'Research',
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
});
