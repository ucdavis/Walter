import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ProjectRecord } from '@/queries/project.ts';
import type { ProjectProjectionResult } from '@/queries/projectProjection.ts';
import { server } from '@/test/mswUtils.ts';
import { renderRoute } from '@/test/routerUtils.tsx';

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
  displayName: 'Test Project',
  expenditureCategoryName: null,
  expenses: 5000,
  flowThroughFundsAmount: null,
  flowThroughFundsEndDate: null,
  flowThroughFundsPrimarySponsor: null,
  flowThroughFundsReferenceAwardName: null,
  flowThroughFundsStartDate: null,
  fundCode: null,
  fundDesc: 'Federal',
  grantAdministrator: null,
  ownerName: null,
  pa: null,
  pi: 'PI Name',
  pm: 'PM Name',
  pmEmployeeId: '2000',
  postReportingPeriod: null,
  ppmBudBal: 4000,
  ppmBudget: 10_000,
  ppmCommitments: 1000,
  ppmExpenses: 5000,
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
  taskStatus: 'Active',
  ...overrides,
});

const emptyProjection: ProjectProjectionResult = {
  categories: [],
  periods: [],
};

const setupHandlers = (
  user: { employeeId: string; name: string },
  projects: ProjectRecord[],
  projection: ProjectProjectionResult = emptyProjection
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
    http.get('/api/project/managed/by-iam/:iamId', () =>
      HttpResponse.json({ pis: [], projectManager: null })
    ),
    http.get('/api/project/by-iam/:iamId', () => HttpResponse.json(projects)),
    http.get('/api/project/personnel', () => HttpResponse.json([])),
    http.get('/api/project/projection/:projectNumber', () =>
      HttpResponse.json(projection)
    ),
    http.get('/api/project/gl-ppm-reconciliation', () =>
      HttpResponse.json([])
    ),
    http.get('/api/system/features', () =>
      HttpResponse.json({
        burndownEnabled: true,
        expenditureProgressEnabled: true,
      })
    )
  );
};

describe('project burndown page', () => {
  it('shows the expired message instead of the chart for expired projects', async () => {
    const projects = [createProject({ awardEndDate: '2000-01-01' })];
    setupHandlers({ employeeId: '1000', name: 'PI User' }, projects);

    const { cleanup } = renderRoute({
      initialPath: '/projectburndown/1000/P1',
    });

    try {
      expect(
        await screen.findByText(
          'Project burndown is not available for expired projects.'
        )
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: /Project Details/ })
      ).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('renders the burndown section for active projects', async () => {
    const projects = [createProject()];
    setupHandlers({ employeeId: '1000', name: 'PI User' }, projects);

    const { cleanup } = renderRoute({
      initialPath: '/projectburndown/1000/P1',
    });

    try {
      expect(
        await screen.findByRole('heading', { name: 'Project Burndown' })
      ).toBeInTheDocument();
      expect(
        screen.queryByText(
          'Project burndown is not available for expired projects.'
        )
      ).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });
});
