import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { ProjectRecord } from '@/queries/project.ts';
import type { ProjectProjectionResult } from '@/queries/projectProjection.ts';
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
    http.get('/api/project/managed/by-iam/:iamId', () => HttpResponse.json({ pis: [], projectManager: null })),
    http.get('/api/project/by-iam/:iamId', () => HttpResponse.json(projects)),
    http.get('/api/project/personnel', () => HttpResponse.json([])),
    http.get('/api/project/projection/:projectNumber', () =>
      HttpResponse.json(projection)
    ),
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
      expect(await screen.findByText('Award Information')).toBeInTheDocument();
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
      http.get('/api/project/managed/by-iam/:iamId', () => HttpResponse.json({ pis: [], projectManager: null })),
      http.get('/api/project/by-iam/:iamId', ({ params }) => {
        if (params.iamId === '10212674') {
          return HttpResponse.json(
            { message: 'You are not allowed to view this portfolio.' },
            { status: 403 }
          );
        }

        return HttpResponse.json([]);
      }),
      http.get('/api/project/personnel', () => HttpResponse.json([])),
      http.get('/api/project/projection/:projectNumber', () =>
        HttpResponse.json(emptyProjection)
      ),
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

  const burndownProjection: ProjectProjectionResult = {
    categories: [
      {
        budget: 500,
        committed: 0,
        expenditureCategory: '01 - Salaries and Wages',
        isPersonnel: 1,
        remainingNow: 400,
        spentToDate: 100,
      },
      {
        budget: 100,
        committed: 0,
        expenditureCategory: '04 - Supplies',
        isPersonnel: 0,
        remainingNow: 80,
        spentToDate: 20,
      },
    ],
    periods: [
      {
        actualAmount: 50,
        displayPeriod: 'May-26',
        expenditureCategory: '01 - Salaries and Wages',
        isPersonnel: 1,
        kind: 'actual',
        month: '2026-05',
        projectedAmount: 0,
        remaining: 400,
      },
      {
        actualAmount: 0,
        displayPeriod: 'Jun-26',
        expenditureCategory: '01 - Salaries and Wages',
        isPersonnel: 1,
        kind: 'blended',
        month: '2026-06',
        projectedAmount: 50,
        remaining: 350,
      },
      {
        actualAmount: 0,
        displayPeriod: 'Jul-26',
        expenditureCategory: '01 - Salaries and Wages',
        isPersonnel: 1,
        kind: 'projected',
        month: '2026-07',
        projectedAmount: 50,
        remaining: 300,
      },
      {
        actualAmount: 10,
        displayPeriod: 'May-26',
        expenditureCategory: '04 - Supplies',
        isPersonnel: 0,
        kind: 'actual',
        month: '2026-05',
        projectedAmount: 0,
        remaining: 80,
      },
      {
        actualAmount: 0,
        displayPeriod: 'Jun-26',
        expenditureCategory: '04 - Supplies',
        isPersonnel: 0,
        kind: 'blended',
        month: '2026-06',
        projectedAmount: 5,
        remaining: 75,
      },
      {
        actualAmount: 0,
        displayPeriod: 'Jul-26',
        expenditureCategory: '04 - Supplies',
        isPersonnel: 0,
        kind: 'projected',
        month: '2026-07',
        projectedAmount: 10,
        remaining: 65,
      },
    ],
  };

  it('shows the project burndown with category toggles when projection data exists', async () => {
    const user = userEvent.setup();
    const projects = [createProject({ pmEmployeeId: '2000' })];
    setupHandlers(
      { employeeId: '1000', name: 'PI User' },
      projects,
      burndownProjection
    );

    const { cleanup } = renderRoute({
      initialPath: '/projects/1000/P1',
    });

    try {
      expect(
        await screen.findByTestId('project-burndown-chart')
      ).toBeInTheDocument();
      expect(screen.getByText('Project Burndown')).toBeInTheDocument();
      expect(screen.getByText('Current Balance')).toBeInTheDocument();

      const personnelToggle = screen.getByRole('button', {
        name: 'Personnel',
      });
      expect(personnelToggle).toHaveAttribute('aria-pressed', 'true');

      const nonPersonnelToggle = screen.getByRole('button', {
        name: 'Non-Personnel',
      });
      expect(nonPersonnelToggle).toHaveAttribute('aria-pressed', 'true');

      const allExpensesToggle = screen.getByRole('button', {
        name: 'All Expenses',
      });
      expect(allExpensesToggle).toHaveAttribute('aria-pressed', 'false');

      // Only the two rollup series are offered; no per-category buttons.
      expect(
        screen.queryByRole('button', { name: '04 - Supplies' })
      ).not.toBeInTheDocument();

      await user.click(nonPersonnelToggle);
      expect(nonPersonnelToggle).toHaveAttribute('aria-pressed', 'false');
    } finally {
      cleanup();
    }
  });

  it('hides the project burndown for internal projects', async () => {
    const projects = [
      createProject({
        awardEndDate: null,
        awardNumber: null,
        awardStartDate: null,
        pmEmployeeId: '2000',
        projectType: 'Internal',
      }),
    ];
    setupHandlers(
      { employeeId: '1000', name: 'PI User' },
      projects,
      burndownProjection
    );

    const { cleanup } = renderRoute({
      initialPath: '/projects/1000/P1',
    });

    try {
      await screen.findByText('Financial Details');
      expect(screen.queryByText('Project Burndown')).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('hides the project burndown when the projection has no periods', async () => {
    const projects = [createProject({ pmEmployeeId: '2000' })];
    setupHandlers({ employeeId: '1000', name: 'PI User' }, projects);

    const { cleanup } = renderRoute({
      initialPath: '/projects/1000/P1',
    });

    try {
      await screen.findByText('Award Information');
      // The section renders a loading state until the projection query
      // resolves, so wait for it to settle and disappear.
      await waitFor(() =>
        expect(screen.queryByText('Project Burndown')).not.toBeInTheDocument()
      );
    } finally {
      cleanup();
    }
  });

  it('shows a tooltip for the Task Breakdown section heading', async () => {
    const user = userEvent.setup();
    const projects = [createProject({ pmEmployeeId: '2000' })];
    setupHandlers({ employeeId: '1000', name: 'PI User' }, projects);

    const { cleanup } = renderRoute({
      initialPath: '/projects/1000/P1',
    });

    try {
      const label = await screen.findByText('Task Breakdown');
      await user.hover(label.parentElement as HTMLElement);

      expect(await screen.findByRole('tooltip')).toHaveTextContent(
        tooltipDefinitions.taskBreakdown
      );
    } finally {
      cleanup();
    }
  });

  it('filters sidebar projects without hiding All Projects', async () => {
    const user = userEvent.setup();
    const projects = [
      createProject({
        displayName: 'Alpha Orchard Grant',
        projectName: 'Alpha Orchard Grant',
        projectNumber: 'P-001',
      }),
      createProject({
        displayName: 'Beta Soil Study',
        projectName: 'Beta Soil Study',
        projectNumber: 'P-002',
      }),
      createProject({
        displayName: 'Gamma Water Trial',
        projectName: 'Gamma Water Trial',
        projectNumber: 'P-003',
      }),
    ];
    setupHandlers({ employeeId: '1000', name: 'PI User' }, projects);

    const { cleanup } = renderRoute({
      initialPath: '/projects/1000/P-001',
    });

    try {
      await screen.findByText('Award Information');

      expect(screen.getAllByText('All Projects')).toHaveLength(2);
      expect(screen.getAllByText('Gamma Water Trial')).toHaveLength(2);

      await user.type(screen.getAllByLabelText('Search projects')[0], 'beta');

      expect(screen.getAllByText('All Projects')).toHaveLength(2);
      expect(screen.getAllByText('Beta Soil Study')).toHaveLength(2);
      expect(screen.queryByText('Gamma Water Trial')).not.toBeInTheDocument();

      await user.click(screen.getAllByLabelText('Clear project search')[0]);

      expect(screen.getAllByText('Gamma Water Trial')).toHaveLength(2);
    } finally {
      cleanup();
    }
  });

  describe('GL/PPM reconciliation alert gating', () => {
    const discrepantReconciliation = [
      {
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
        project: 'P1',
        projectDescription: null,
        remainingBalance: -100,
      },
    ];

    const setupDetailHandlers = ({
      projects,
      reconciliation = discrepantReconciliation,
      user,
    }: {
      projects: ProjectRecord[];
      reconciliation?: typeof discrepantReconciliation;
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
        http.get('/api/project/by-iam/:iamId', () =>
          HttpResponse.json(projects)
        ),
        http.get('/api/project/personnel', () => HttpResponse.json([])),
        http.get('/api/project/projection/:projectNumber', () =>
          HttpResponse.json(emptyProjection)
        ),
        http.get('/api/project/gl-ppm-reconciliation', () =>
          HttpResponse.json(reconciliation)
        )
      );
    };

    it.each(['Internal', 'Sponsored'] as const)(
      'shows balanced reconciliation alert for authorized project managers on %s project details',
      async (projectType) => {
        const projectNumber = `P-${projectType}`;
        const projects = [
          createProject({
            pmEmployeeId: '1000',
            projectNumber,
            projectType,
          }),
        ];
        setupDetailHandlers({
          projects,
          reconciliation: [],
          user: {
            employeeId: '1000',
            name: 'PM User',
            roles: [],
          },
        });

        const { cleanup } = renderRoute({
          initialPath: `/projects/1000/${projectNumber}`,
        });

        try {
          expect(
            await screen.findByText('Project Number', {}, { timeout: 3000 })
          ).toBeInTheDocument();

          const message = await screen.findByText(
            'GL/PPM is Balanced. Click here to view.',
            {},
            { timeout: 3000 }
          );
          const alert = message.closest('[role="alert"]');

          expect(alert).toHaveClass('alert-success');
          expect(message.closest('a')).toHaveAttribute(
            'href',
            `/reports/reconciliation/${projectNumber}`
          );
        } finally {
          cleanup();
        }
      }
    );

    it('hides reconciliation alert for PI viewing own internal project', async () => {
      const projects = [
        createProject({ pmEmployeeId: '2000', projectType: 'Internal' }),
      ];
      setupDetailHandlers({
        projects,
        user: { employeeId: '1000', name: 'PI User', roles: [] },
      });

      const { cleanup } = renderRoute({ initialPath: '/projects/1000/P1' });

      try {
        await screen.findByText('Project Number');
        expect(
          screen.queryByText(/has a gl\/ppm reconciliation discrepancy/i)
        ).not.toBeInTheDocument();
        expect(
          screen.queryByText(/gl ppm is balanced/i)
        ).not.toBeInTheDocument();
      } finally {
        cleanup();
      }
    });

  });
});
