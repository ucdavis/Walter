import { describe, expect, it } from 'vitest';
import { focusManager } from '@tanstack/react-query';
import { act, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import type {
  GLPPMReconciliationRecord,
  ManagedPisEnvelope,
  ProjectRecord,
} from '@/queries/project.ts';
import { server } from '@/test/mswUtils.ts';
import {
  createProjectRecord,
  createReconciliationRecord,
} from '@/test/projectFixtures.ts';
import { renderRoute } from '@/test/routerUtils.tsx';

const createUser = (roles: string[]) => ({
  email: 'test@example.com',
  employeeId: '1000',
  iamId: 'IAM-1000',
  id: 'user-1',
  kerberos: 'testuser',
  name: 'Test User',
  roles,
});

const emptyManagedResponse = {
  pis: [],
  projectManager: null,
};

const managedResponse = (
  name: string | null = 'Test User'
): ManagedPisEnvelope => ({
  pis: [
    { employeeId: '2001', iamId: 'IAM-2001', name: 'PI One', projectCount: 2 },
    { employeeId: '2002', iamId: 'IAM-2002', name: 'PI Two', projectCount: 1 },
  ],
  projectManager: { employeeId: '1000', iamId: 'IAM-1000', name },
});

const outOfBalance = (project: string) =>
  createReconciliationRecord({ glActualAmount: -100, ppmBudBal: 0, project });

const internalProject = (
  projectNumber: string,
  overrides: Partial<ProjectRecord> = {}
) =>
  createProjectRecord({
    projectName: `Project ${projectNumber}`,
    projectNumber,
    ...overrides,
  });

const setupHandlers = ({
  managed = managedResponse(),
  portfolios = {},
  reconciliation = [],
  user = createUser(['ProjectManager']),
}: {
  managed?: ManagedPisEnvelope | typeof emptyManagedResponse;
  portfolios?: Record<string, ProjectRecord[] | 'error'>;
  reconciliation?: GLPPMReconciliationRecord[] | 'error' | 'pending';
  user?: ReturnType<typeof createUser>;
} = {}) => {
  const reconciliationRequests: string[][] = [];

  server.use(
    http.get('/api/user/me', () => HttpResponse.json(user)),
    http.get('/api/project/managed/by-iam/:iamId', () =>
      HttpResponse.json(managed)
    ),
    http.get('/api/project/by-iam/:iamId', ({ params }) => {
      const portfolio = portfolios[params.iamId as string];
      if (portfolio === 'error') {
        return new HttpResponse(null, { status: 500 });
      }
      return HttpResponse.json(portfolio ?? []);
    }),
    http.get('/api/project/personnel', () => HttpResponse.json([])),
    http.get('/api/project/gl-ppm-reconciliation', async ({ request }) => {
      const codes =
        new URL(request.url).searchParams.get('projectCodes')?.split(',') ?? [];
      reconciliationRequests.push(codes);
      if (reconciliation === 'pending') {
        await delay('infinite');
      }
      if (reconciliation === 'error') {
        return new HttpResponse(null, { status: 500 });
      }
      return HttpResponse.json(
        (reconciliation === 'pending' ? [] : reconciliation).filter((r) =>
          codes.includes(r.project)
        )
      );
    })
  );

  return { reconciliationRequests };
};

const piRow = (name: string) => {
  const row = screen.getByRole('link', { name }).closest('tr');
  if (!row) {
    throw new Error(`No row for ${name}`);
  }
  return row;
};

// Lets React Query's batched notifications reach the DOM.
const flushRender = () =>
  act(() => new Promise((resolve) => setTimeout(resolve, 50)));

const issuesTile = () => {
  const tile = screen.getByText('Reconciliation issues').closest('div');
  if (!tile) {
    throw new Error('No reconciliation issues tile');
  }
  return tile;
};

describe('principal investigators route', () => {
  it('renders the principal investigators table for authorized users', async () => {
    setupHandlers({ user: createUser(['FinancialViewer']) });

    const { cleanup } = renderRoute({
      initialPath: '/principalInvestigators',
    });

    try {
      await screen.findByRole('heading', {
        name: 'Principal Investigators managed by Test User',
      });
      expect(screen.getByText('PI One')).toBeInTheDocument();
      expect(screen.getByText('PI Two')).toBeInTheDocument();
      expect(
        screen.getByText('2 investigators across 3 projects')
      ).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('falls back to the generic heading when project manager name is missing', async () => {
    setupHandlers({
      managed: managedResponse(null),
      user: createUser(['FinancialViewer']),
    });

    const { cleanup } = renderRoute({
      initialPath: '/principalInvestigators',
    });

    try {
      await screen.findByRole('heading', {
        name: 'Managed Principal Investigators',
      });
    } finally {
      cleanup();
    }
  });

  it('shows the empty state when no managed investigators are returned', async () => {
    setupHandlers({ managed: emptyManagedResponse });

    const { cleanup } = renderRoute({
      initialPath: '/principalInvestigators',
    });

    try {
      await screen.findByText(
        "Looks like there aren't any principal investigators for Walter to fetch..."
      );
    } finally {
      cleanup();
    }
  });

  it('hides PIs without an IAM ID', async () => {
    setupHandlers({
      managed: {
        pis: [
          {
            employeeId: '2001',
            iamId: 'IAM-PI-ONE',
            name: 'PI One',
            projectCount: 2,
          },
          { employeeId: '2002', iamId: null, name: 'PI Two', projectCount: 1 },
        ],
        projectManager: {
          employeeId: '1000',
          iamId: 'IAM-1000',
          name: 'Test User',
        },
      },
      user: createUser(['FinancialViewer']),
    });

    const { cleanup } = renderRoute({
      initialPath: '/principalInvestigators',
    });

    try {
      const linkedPi = await screen.findByRole('link', { name: 'PI One' });
      expect(linkedPi).toHaveAttribute('href', '/projects/IAM-PI-ONE');
      expect(screen.queryByText('PI Two')).toBeNull();
      expect(
        screen.getByText('1 investigators across 2 projects')
      ).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('shows reconciliation issue counts per PI', async () => {
    setupHandlers({
      managed: {
        pis: [
          {
            employeeId: '2001',
            iamId: 'IAM-2001',
            name: 'PI One',
            projectCount: 2,
          },
          {
            employeeId: '2002',
            iamId: 'IAM-2002',
            name: 'PI Two',
            projectCount: 1,
          },
          {
            employeeId: '2003',
            iamId: 'IAM-2003',
            name: 'PI Three',
            projectCount: 1,
          },
        ],
        projectManager: {
          employeeId: '1000',
          iamId: 'IAM-1000',
          name: 'Test User',
        },
      },
      portfolios: {
        'IAM-2001': [internalProject('P1'), internalProject('P2')],
        'IAM-2002': [internalProject('P3')],
        'IAM-2003': [internalProject('P4')],
      },
      reconciliation: [
        outOfBalance('P1'),
        outOfBalance('P2'),
        outOfBalance('P3'),
        createReconciliationRecord({ project: 'P4' }),
      ],
    });

    const { cleanup } = renderRoute({
      initialPath: '/principalInvestigators',
    });

    try {
      await screen.findByRole('link', { name: 'PI One' });
      expect(
        await within(piRow('PI One')).findByText('2 reconciliation issues')
      ).toBeInTheDocument();
      expect(
        within(piRow('PI Two')).getByText('1 reconciliation issue')
      ).toBeInTheDocument();
      await waitFor(() => {
        expect(within(issuesTile()).getByText('3')).toBeInTheDocument();
      });
      expect(
        within(piRow('PI Three')).queryByText(/reconciliation issue/)
      ).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('lists PIs alphabetically', async () => {
    setupHandlers({
      managed: {
        pis: [
          {
            employeeId: '2001',
            iamId: 'IAM-2001',
            name: 'Zed',
            projectCount: 1,
          },
          {
            employeeId: '2002',
            iamId: 'IAM-2002',
            name: 'Amy',
            projectCount: 1,
          },
          {
            employeeId: '2003',
            iamId: 'IAM-2003',
            name: 'Mia',
            projectCount: 1,
          },
        ],
        projectManager: {
          employeeId: '1000',
          iamId: 'IAM-1000',
          name: 'Test User',
        },
      },
    });

    const { cleanup } = renderRoute({
      initialPath: '/principalInvestigators',
    });

    try {
      await screen.findByRole('link', { name: 'Zed' });
      const names = screen
        .getAllByRole('link')
        .map((link) => link.textContent)
        .filter((name) => ['Amy', 'Mia', 'Zed'].includes(name ?? ''));
      expect(names).toEqual(['Amy', 'Mia', 'Zed']);
    } finally {
      cleanup();
    }
  });

  it("only requests reconciliation for this PM's internal projects", async () => {
    const { reconciliationRequests } = setupHandlers({
      portfolios: {
        'IAM-2001': [
          internalProject('P1'),
          internalProject('P2', { pmEmployeeId: '9999' }),
          internalProject('S1', { projectType: 'Sponsored' }),
        ],
      },
      reconciliation: [outOfBalance('P1')],
    });

    const { cleanup } = renderRoute({
      initialPath: '/principalInvestigators',
    });

    try {
      await screen.findByText('1 reconciliation issue');
      expect(reconciliationRequests).toEqual([['P1']]);
    } finally {
      cleanup();
    }
  });

  it('filters by the viewed PM for financial viewers', async () => {
    const { reconciliationRequests } = setupHandlers({
      managed: {
        pis: [
          {
            employeeId: '2001',
            iamId: 'IAM-2001',
            name: 'PI One',
            projectCount: 2,
          },
        ],
        projectManager: {
          employeeId: '9999',
          iamId: 'IAM-9999',
          name: 'Other PM',
        },
      },
      portfolios: {
        'IAM-2001': [
          internalProject('P1'),
          internalProject('P2', { pmEmployeeId: '9999' }),
        ],
      },
      reconciliation: [outOfBalance('P1'), outOfBalance('P2')],
      user: createUser(['FinancialViewer']),
    });

    const { cleanup } = renderRoute({
      initialPath: '/principalInvestigators/IAM-9999',
    });

    try {
      await screen.findByText('1 reconciliation issue');
      expect(reconciliationRequests).toEqual([['P2']]);
    } finally {
      cleanup();
    }
  });

  it('batches reconciliation requests by 100 projects', async () => {
    const projects = Array.from({ length: 150 }, (_, i) =>
      internalProject(`P${String(i).padStart(3, '0')}`)
    );
    const { reconciliationRequests } = setupHandlers({
      portfolios: { 'IAM-2001': projects },
    });

    const { cleanup } = renderRoute({
      initialPath: '/principalInvestigators',
    });

    try {
      await screen.findByRole('link', { name: 'PI One' });
      await waitFor(() => {
        expect(reconciliationRequests.map((r) => r.length).sort()).toEqual([
          100, 50,
        ]);
      });
    } finally {
      cleanup();
    }
  });

  it('renders the PI list before reconciliation resolves', async () => {
    setupHandlers({
      portfolios: { 'IAM-2001': [internalProject('P1')] },
      reconciliation: 'pending',
    });

    const { cleanup } = renderRoute({
      initialPath: '/principalInvestigators',
    });

    try {
      await screen.findByRole('link', { name: 'PI One' });
      expect(
        within(piRow('PI One')).getByLabelText('Loading reconciliation')
      ).toBeInTheDocument();
      expect(within(issuesTile()).getByText('-')).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('isolates a failed PI portfolio', async () => {
    setupHandlers({
      portfolios: {
        'IAM-2001': 'error',
        'IAM-2002': [internalProject('P3')],
      },
      reconciliation: [outOfBalance('P3')],
    });

    const { cleanup } = renderRoute({
      initialPath: '/principalInvestigators',
    });

    try {
      await screen.findByRole('link', { name: 'PI One' });
      expect(
        await within(piRow('PI Two')).findByText('1 reconciliation issue')
      ).toBeInTheDocument();
      expect(
        within(piRow('PI One')).getByLabelText("Couldn't load reconciliation")
      ).toBeInTheDocument();
      expect(within(issuesTile()).getByText('-')).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('keeps other PIs loaded while a failed portfolio refetches on focus', async () => {
    setupHandlers({
      portfolios: {
        'IAM-2001': 'error',
        'IAM-2002': [internalProject('P3')],
      },
      reconciliation: [outOfBalance('P3')],
    });

    const { cleanup } = renderRoute({
      initialPath: '/principalInvestigators',
    });

    try {
      await screen.findByRole('link', { name: 'PI One' });
      await within(piRow('PI Two')).findByText('1 reconciliation issue');

      server.use(
        http.get('/api/project/by-iam/IAM-2001', async () => {
          await delay('infinite');
        })
      );
      focusManager.setFocused(false);
      focusManager.setFocused(true);

      expect(
        await within(piRow('PI One')).findByLabelText('Loading reconciliation')
      ).toBeInTheDocument();
      expect(
        within(piRow('PI Two')).getByText('1 reconciliation issue')
      ).toBeInTheDocument();
    } finally {
      focusManager.setFocused(undefined);
      cleanup();
    }
  });

  it('keeps reconciliation counts when a background refetch fails', async () => {
    setupHandlers({
      portfolios: { 'IAM-2002': [internalProject('P3')] },
      reconciliation: [outOfBalance('P3')],
    });

    const { cleanup, queryClient } = renderRoute({
      initialPath: '/principalInvestigators',
    });

    try {
      await screen.findByRole('link', { name: 'PI Two' });
      await within(piRow('PI Two')).findByText('1 reconciliation issue');

      server.use(
        http.get(
          '/api/project/gl-ppm-reconciliation',
          () => new HttpResponse(null, { status: 500 })
        )
      );
      await queryClient.refetchQueries({ queryKey: ['gl-ppm-reconciliation'] });
      await flushRender();

      expect(
        queryClient.getQueryState(['gl-ppm-reconciliation', 'P3'])?.status
      ).toBe('error');
      expect(
        within(piRow('PI Two')).getByText('1 reconciliation issue')
      ).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('keeps reconciliation counts when a portfolio refetch fails', async () => {
    setupHandlers({
      portfolios: { 'IAM-2002': [internalProject('P3')] },
      reconciliation: [outOfBalance('P3')],
    });

    const { cleanup, queryClient } = renderRoute({
      initialPath: '/principalInvestigators',
    });

    try {
      await screen.findByRole('link', { name: 'PI Two' });
      await within(piRow('PI Two')).findByText('1 reconciliation issue');

      server.use(
        http.get(
          '/api/project/by-iam/IAM-2002',
          () => new HttpResponse(null, { status: 500 })
        )
      );
      await queryClient.refetchQueries({
        queryKey: ['projects', 'by-iam', 'IAM-2002'],
      });
      await flushRender();

      expect(
        queryClient.getQueryState(['projects', 'by-iam', 'IAM-2002'])?.status
      ).toBe('error');
      expect(
        within(piRow('PI Two')).getByText('1 reconciliation issue')
      ).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('counts a co-PI project once in the stat tile', async () => {
    const { reconciliationRequests } = setupHandlers({
      portfolios: {
        'IAM-2001': [internalProject('P1')],
        'IAM-2002': [internalProject('P1')],
      },
      reconciliation: [outOfBalance('P1')],
    });

    const { cleanup } = renderRoute({
      initialPath: '/principalInvestigators',
    });

    try {
      await screen.findByRole('link', { name: 'PI One' });
      expect(
        await within(piRow('PI One')).findByText('1 reconciliation issue')
      ).toBeInTheDocument();
      expect(
        within(piRow('PI Two')).getByText('1 reconciliation issue')
      ).toBeInTheDocument();
      expect(within(issuesTile()).getByText('1')).toBeInTheDocument();
      expect(reconciliationRequests).toEqual([['P1']]);
    } finally {
      cleanup();
    }
  });

  it('expands a PI to one reconciliation table across its projects', async () => {
    const user = userEvent.setup();
    setupHandlers({
      portfolios: {
        'IAM-2001': [internalProject('P2'), internalProject('P1')],
      },
      reconciliation: [
        createReconciliationRecord({ fundCode: 'F0', project: 'P2' }),
        outOfBalance('P1'),
      ],
    });

    const { cleanup } = renderRoute({
      initialPath: '/principalInvestigators',
    });

    try {
      await screen.findByRole('link', { name: 'PI One' });
      await within(piRow('PI One')).findByText('1 reconciliation issue');

      await user.click(piRow('PI One'));
      const reconciliationTable = (
        await screen.findByRole('columnheader', { name: 'GL Balance' })
      ).closest('table');
      if (!reconciliationTable) {
        throw new Error('No reconciliation table');
      }

      const headers = within(reconciliationTable)
        .getAllByRole('columnheader')
        .map((header) => header.textContent);
      expect(headers.slice(0, 3)).toEqual(['Project', 'Dept', 'GL Fund']);

      const rows = within(reconciliationTable).getAllByRole('row').slice(1);
      expect(rows.map((row) => row.querySelector('td')?.textContent)).toEqual([
        'P1',
        'P2',
      ]);
      expect(rows[0]).toHaveClass('bg-info/10');
      expect(
        within(reconciliationTable).getAllByRole('link', { name: 'Details' })
      ).toHaveLength(2);

      await user.click(piRow('PI Two'));
      expect(
        await screen.findByText('No internal projects.')
      ).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('PI name link navigates instead of expanding', async () => {
    const user = userEvent.setup();
    setupHandlers({ portfolios: { 'IAM-2001': [internalProject('P1')] } });

    const { cleanup, router } = renderRoute({
      initialPath: '/principalInvestigators',
    });

    try {
      await user.click(await screen.findByRole('link', { name: 'PI One' }));
      await waitFor(() => {
        expect(router.state.location.pathname).toBe('/projects/IAM-2001');
      });
    } finally {
      cleanup();
    }
  });

  it('shows the known-issue note', async () => {
    setupHandlers();

    const { cleanup } = renderRoute({
      initialPath: '/principalInvestigators',
    });

    try {
      expect(
        await screen.findByText(
          "GL and PPM balances can differ from the UCD PPM to GL Non-Sponsored Projects Reconciliation Report; see any project's reconciliation page for details."
        )
      ).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('redirects unauthorized users back to home', async () => {
    setupHandlers({ managed: emptyManagedResponse, user: createUser([]) });

    const { cleanup } = renderRoute({
      initialPath: '/principalInvestigators',
    });

    try {
      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: 'W.A.L.T.E.R.' })
        ).toBeInTheDocument();
      });
    } finally {
      cleanup();
    }
  });
});

describe('principal investigators $iamId route', () => {
  it('allows a FinancialViewer to view another PM', async () => {
    setupHandlers({
      managed: {
        pis: [
          {
            employeeId: '2001',
            iamId: 'IAM-2001',
            name: 'PI One',
            projectCount: 2,
          },
        ],
        projectManager: {
          employeeId: '9999',
          iamId: 'IAM-9999',
          name: 'Other PM',
        },
      },
      user: createUser(['FinancialViewer']),
    });

    const { cleanup } = renderRoute({
      initialPath: '/principalInvestigators/IAM-9999',
    });

    try {
      await screen.findByRole('heading', {
        name: 'Principal Investigators managed by Other PM',
      });
      expect(screen.getByText('PI One')).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('allows a user to view their own managed PIs via $iamId', async () => {
    setupHandlers();

    const { cleanup } = renderRoute({
      initialPath: '/principalInvestigators/IAM-1000',
    });

    try {
      await screen.findByRole('heading', {
        name: 'Principal Investigators managed by Test User',
      });
    } finally {
      cleanup();
    }
  });

  it('redirects a non-FinancialViewer viewing another PM back to home', async () => {
    setupHandlers({ managed: emptyManagedResponse });

    const { cleanup } = renderRoute({
      initialPath: '/principalInvestigators/IAM-9999',
    });

    try {
      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: 'W.A.L.T.E.R.' })
        ).toBeInTheDocument();
      });
    } finally {
      cleanup();
    }
  });
});
