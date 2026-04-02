import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { ProjectRecord } from '@/queries/project.ts';
import { server } from '@/test/mswUtils.ts';
import { renderRoute } from '@/test/routerUtils.tsx';
import { tooltipDefinitions } from '@/shared/tooltips.ts';

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
  fundCode: null,
  fundDesc: 'Federal',
  grantAdministrator: null,
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
    http.get('/api/project/managed/:employeeId', () => HttpResponse.json([])),
    http.get('/api/project/:employeeId', () => HttpResponse.json(projects)),
    http.get('/api/project/personnel', () => HttpResponse.json([])),
    http.get('/api/project/gl-ppm-reconciliation', () => HttpResponse.json([]))
  );
};

describe('project detail page', () => {
  it('shows Award Information for all users', async () => {
    const projects = [createProject({ pmEmployeeId: '2000' })];
    setupHandlers({ employeeId: '1000', name: 'PI User' }, projects);

    const { cleanup } = renderRoute({
      initialPath: '/projects/1000/P1',
    });

    try {
      expect(
        await screen.findByText('Award Information')
      ).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('shows Show more button only for project managers', async () => {
    const projects = [createProject({ pmEmployeeId: '1000' })];
    setupHandlers({ employeeId: '1000', name: 'PM User' }, projects);

    const { cleanup } = renderRoute({
      initialPath: '/projects/1000/P1',
    });

    try {
      await screen.findByText('Award Information');
      expect(
        screen.getByRole('button', { name: 'Show more' })
      ).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('hides Show more button for non-project managers', async () => {
    const projects = [createProject({ pmEmployeeId: '2000' })];
    setupHandlers({ employeeId: '1000', name: 'PI User' }, projects);

    const { cleanup } = renderRoute({
      initialPath: '/projects/1000/P1',
    });

    try {
      await screen.findByText('Award Information');
      expect(
        screen.queryByRole('button', { name: 'Show more' })
      ).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('hides Award Information and date fields for internal projects', async () => {
    const projects = [
      createProject({
        awardEndDate: null,
        awardNumber: null,
        awardStartDate: null,
        projectType: 'Internal',
      }),
    ];
    setupHandlers({ employeeId: '1000', name: 'PI User' }, projects);

    const { cleanup } = renderRoute({
      initialPath: '/projects/1000/P1',
    });

    try {
      await screen.findByText('Project Number');
      expect(screen.queryByText('Award Information')).not.toBeInTheDocument();
      expect(screen.queryByText('Project Start')).not.toBeInTheDocument();
      expect(screen.queryByText('Project End')).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('shows an authorization error inside the projects layout for forbidden portfolios', async () => {
    server.use(
      http.get('/api/user/me', () =>
        HttpResponse.json({
          email: 'pi.user@example.com',
          employeeId: '1000',
          id: 'user-1',
          kerberos: 'piuser',
          name: 'PI User',
          roles: [],
        })
      ),
      http.get('/api/project/managed/:employeeId', () => HttpResponse.json([])),
      http.get('/api/project/:employeeId', ({ params }) => {
        if (params.employeeId === '10212674') {
          return HttpResponse.json(
            { message: 'You are not allowed to view this portfolio.' },
            { status: 403 }
          );
        }

        return HttpResponse.json([]);
      }),
      http.get('/api/project/personnel', () => HttpResponse.json([])),
      http.get('/api/project/gl-ppm-reconciliation', () =>
        HttpResponse.json([])
      )
    );

    const { cleanup } = renderRoute({
      initialPath: '/projects/10212674',
    });

    try {
      expect(
        await screen.findByRole('heading', {
          name: 'You do not have access to this portfolio',
        })
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'Walter can only show project portfolios you are allowed to open.'
        )
      ).toBeInTheDocument();
      expect(
        screen.getByText('You are not allowed to view this portfolio.')
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Projects' })
      ).toBeInTheDocument();
      expect(
        screen.queryByText('We could not reach the server')
      ).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('shows a tooltip for the Chart String Breakdown section heading', async () => {
    const user = userEvent.setup();
    const projects = [createProject({ pmEmployeeId: '2000' })];
    setupHandlers({ employeeId: '1000', name: 'PI User' }, projects);

    const { cleanup } = renderRoute({
      initialPath: '/projects/1000/P1',
    });

    try {
      const label = await screen.findByText('Chart String Breakdown');
      await user.hover(label.parentElement as HTMLElement);

      expect(await screen.findByRole('tooltip')).toHaveTextContent(
        tooltipDefinitions.chartStringBreakdown
      );
    } finally {
      cleanup();
    }
  });
});
