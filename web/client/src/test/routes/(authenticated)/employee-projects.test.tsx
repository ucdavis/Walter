import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ProjectRecord } from '@/queries/project.ts';
import { server } from '@/test/mswUtils.ts';
import { renderRoute } from '@/test/routerUtils.tsx';

const baseProject = (overrides: Partial<ProjectRecord> = {}): ProjectRecord =>
  ({
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
    displayName: 'P1: Internal Project',
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
    projectName: 'Internal Project',
    projectNumber: 'P1',
    projectOwningOrg: 'ORG001',
    projectOwningOrgCode: 'ORG001',
    projectStatusCode: 'ACTIVE',
    projectType: 'Internal',
    purposeDesc: 'Research',
    sponsorAwardNumber: null,
    taskName: 'Task 1',
    taskNum: 'T001',
    taskStatus: 'Active',
    ...overrides,
  }) as ProjectRecord;

const discrepancyRecord = (projectNumber: string) => ({
  activityCode: null,
  activityDescription: null,
  financialDepartment: 'DEPT',
  fundCode: null,
  fundDescription: null,
  glActualAmount: -100,
  ppmBudBal: 0,
  ppmFundCode: 'PPMFUND',
  ppmFundDescription: null,
  programCode: null,
  programDescription: null,
  project: projectNumber,
  projectDescription: null,
  remainingBalance: -100,
});

const setupHandlers = ({
  projects,
  reconciliation,
  user,
}: {
  projects: ProjectRecord[];
  reconciliation: ReturnType<typeof discrepancyRecord>[];
  user: { employeeId: string; name: string; roles: string[] };
}) => {
  server.use(
    http.get('/api/user/me', () =>
      HttpResponse.json({
        email: `${user.name.toLowerCase()}@example.com`,
        employeeId: user.employeeId,
        id: 'user-1',
        kerberos: user.name.toLowerCase(),
        name: user.name,
        roles: user.roles,
      })
    ),
    http.get('/api/project/managed/by-iam/:iamId', () =>
      HttpResponse.json({ pis: [], projectManager: null })
    ),
    http.get('/api/project/by-iam/:iamId', () => HttpResponse.json(projects)),
    http.get('/api/project/personnel', () => HttpResponse.json([])),
    http.get('/api/project/gl-ppm-reconciliation', () =>
      HttpResponse.json(reconciliation)
    )
  );
};

describe('employee project list — discrepancy icon gating', () => {
  it('hides icon for PI viewing their own internal project with a discrepancy', async () => {
    const projects = [baseProject({ pmEmployeeId: '2000' })];
    setupHandlers({
      projects,
      reconciliation: [discrepancyRecord('P1')],
      user: { employeeId: '1000', name: 'PI User', roles: [] },
    });

    const { cleanup } = renderRoute({ initialPath: '/projects/1000' });

    try {
      await screen.findByText('Internal Projects');
      expect(
        screen.queryByTitle('GL/PPM reconciliation discrepancy')
      ).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

});
