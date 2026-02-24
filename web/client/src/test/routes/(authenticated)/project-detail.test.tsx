import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ProjectRecord } from '@/queries/project.ts';
import { server } from '@/test/mswUtils.ts';
import { renderRoute } from '@/test/routerUtils.tsx';

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
  displayName: 'Test Project',
  expenditureCategoryName: 'All Expenditures',
  fundCode: null,
  fundDesc: 'Federal',
  grantAdministrator: null,
  pa: null,
  pi: 'PI Name',
  pm: 'PM Name',
  pmEmployeeId: '2000',
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

const setupHandlers = (
  user: { employeeId: string; name: string },
  projects: ProjectRecord[]
) => {
  server.use(
    http.get('/api/user/me', () =>
      HttpResponse.json({
        email: `${user.name.toLowerCase()}@example.com`,
        employeeId: user.employeeId,
        id: 'user-1',
        kerberos: user.name.toLowerCase(),
        name: user.name,
        roles: [],
      })
    ),
    http.get('/api/project/managed/:employeeId', () =>
      HttpResponse.json([])
    ),
    http.get('/api/project/:employeeId', () =>
      HttpResponse.json(projects)
    ),
    http.get('/api/project/personnel', () => HttpResponse.json([])),
    http.get('/api/project/gl-ppm-reconciliation', () =>
      HttpResponse.json([])
    )
  );
};

describe('project detail page', () => {
  it('shows Additional Information when user is the project manager', async () => {
    const projects = [createProject({ pmEmployeeId: '1000' })];
    setupHandlers({ employeeId: '1000', name: 'PM User' }, projects);

    const { cleanup } = renderRoute({
      initialPath: '/projects/1000/P1',
    });

    try {
      expect(
        await screen.findByText('Additional Information')
      ).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('hides Additional Information when user is not the project manager', async () => {
    const projects = [createProject({ pmEmployeeId: '2000' })];
    setupHandlers({ employeeId: '1000', name: 'PI User' }, projects);

    const { cleanup } = renderRoute({
      initialPath: '/projects/1000/P1',
    });

    try {
      // Wait for the page to render by finding the project heading
      await screen.findByRole('heading', { name: 'Test Project' });

      expect(
        screen.queryByText('Additional Information')
      ).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });
});