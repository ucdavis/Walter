import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { getPiProjectAlerts } from '@/lib/projectAlerts.ts';
import { PiWithProjects } from '@/queries/project.ts';
import { server } from '@/test/mswUtils.ts';
import { renderRoute } from '@/test/routerUtils.tsx';

const createPi = (
  employeeId: string,
  projects: Array<{
    catBudBal: number;
    catBudget: number;
    displayName: string;
    projectName: string;
    projectNumber: string;
  }>
): PiWithProjects => ({
  employeeId,
  name: `PI ${employeeId}`,
  projectCount: projects.length,
  projects: projects as PiWithProjects['projects'],
  totalBalance: projects.reduce((sum, p) => sum + p.catBudBal, 0),
  totalBudget: projects.reduce((sum, p) => sum + p.catBudget, 0),
});

describe('home route', () => {
  it('renders managed investigators dashboard when user manages investigators', async () => {
    const managedPis = [
      { employeeId: '2001', name: 'PI One', projectCount: 2 },
      { employeeId: '2002', name: 'PI Two', projectCount: 1 },
    ];

    const user = {
      email: 'alpha@example.com',
      employeeId: '1000',
      id: 'user-1',
      kerberos: 'alpha',
      name: 'Alpha User',
      roles: ['admin'],
    };

    let managedRequestCount = 0;
    let userRequestCount = 0;

    server.use(
      http.get('/api/project/managed/:employeeId', ({ params }) => {
        managedRequestCount += 1;
        if (params.employeeId !== user.employeeId) {
          return HttpResponse.json([], { status: 400 });
        }
        return HttpResponse.json(managedPis);
      }),
      http.get('/api/project/:employeeId', () => {
        // Return empty projects for each PI
        return HttpResponse.json([]);
      }),
      http.get('/api/user/me', () => {
        userRequestCount += 1;
        return HttpResponse.json(user);
      }),
      http.get('/api/project/personnel', () => HttpResponse.json([]))
    );

    const { cleanup } = renderRoute({ initialPath: '/' });

    try {
      expect(
        await screen.findByRole('heading', { name: 'W.A.L.T.E.R.' })
      ).toBeInTheDocument();
      expect(await screen.findByText('PI One')).toBeInTheDocument();
      expect(await screen.findByText('PI Two')).toBeInTheDocument();
      expect(managedRequestCount).toBe(1);
      expect(userRequestCount).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('shows projects table when user is not a PM', async () => {
    const user = {
      email: 'alpha@example.com',
      employeeId: '1000',
      id: 'user-1',
      kerberos: 'alpha',
      name: 'Alpha User',
      roles: ['admin'],
    };

    const projects = [
      {
        awardEndDate: '2099-12-31',
        catBudBal: 1000,
        displayName: 'P1: Project One',
        projectName: 'Project One',
        projectNumber: 'P1',
      },
      {
        awardEndDate: null,
        catBudBal: 2000,
        displayName: 'P2: Project Two',
        projectName: 'Project Two',
        projectNumber: 'P2',
      },
    ];

    server.use(
      http.get('/api/user/me', () => HttpResponse.json(user)),
      http.get('/api/project/managed/:employeeId', () => HttpResponse.json([])),
      http.get('/api/project/:employeeId', () => HttpResponse.json(projects)),
      http.get('/api/project/personnel', () => HttpResponse.json([]))
    );

    const { cleanup } = renderRoute({ initialPath: '/' });

    try {
      // Should show Projects tab and project table
      expect(
        await screen.findByRole('tab', { name: 'Projects' })
      ).toBeInTheDocument();
      expect(await screen.findByText('P1: Project One')).toBeInTheDocument();
      expect(await screen.findByText('P2: Project Two')).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('aggregates projects by project number with summed balance', async () => {
    const user = {
      email: 'alpha@example.com',
      employeeId: '1000',
      id: 'user-1',
      kerberos: 'alpha',
      name: 'Alpha User',
      roles: ['admin'],
    };

    // Same project with multiple records (different tasks/categories)
    const projects = [
      {
        awardEndDate: '2099-12-31',
        catBudBal: 1000,
        displayName: 'P1: Project One',
        projectName: 'Project One',
        projectNumber: 'P1',
      },
      {
        awardEndDate: '2099-12-31',
        catBudBal: 500,
        displayName: 'P1: Project One',
        projectName: 'Project One',
        projectNumber: 'P1',
      },
      {
        awardEndDate: '2099-12-31',
        catBudBal: 250,
        displayName: 'P1: Project One',
        projectName: 'Project One',
        projectNumber: 'P1',
      },
    ];

    server.use(
      http.get('/api/user/me', () => HttpResponse.json(user)),
      http.get('/api/project/managed/:employeeId', () => HttpResponse.json([])),
      http.get('/api/project/:employeeId', () => HttpResponse.json(projects)),
      http.get('/api/project/personnel', () => HttpResponse.json([]))
    );

    const { cleanup } = renderRoute({ initialPath: '/' });

    try {
      await screen.findByText('P1: Project One');
      // Should only have one row for Project One
      const rows = screen.getAllByRole('row');
      // 1 header row + 1 data row + 1 totals row
      expect(rows).toHaveLength(3);
      // Balance should be summed: 1000 + 500 + 250 = 1750
      // Appears in both data row and totals row
      expect(screen.getAllByText('$1,750.00')).toHaveLength(2);
    } finally {
      cleanup();
    }
  });

  it('shows reports only when user is neither PM nor PI', async () => {
    const user = {
      email: 'alpha@example.com',
      employeeId: '1000',
      id: 'user-1',
      kerberos: 'alpha',
      name: 'Alpha User',
      roles: ['admin'],
    };

    server.use(
      http.get('/api/user/me', () => HttpResponse.json(user)),
      http.get('/api/project/managed/:employeeId', () => HttpResponse.json([])),
      http.get('/api/project/:employeeId', () => HttpResponse.json([])),
      http.get('/api/project/personnel', () => HttpResponse.json([])),
    );

    const { cleanup } = renderRoute({ initialPath: '/' });

    try {
      await screen.findByRole('heading', { name: 'W.A.L.T.E.R.' });

      expect(
        screen.queryByRole('tab', { name: 'Principal Investigators' })
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: 'Projects' })).not.toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: 'Reports' })).not.toBeInTheDocument();

      expect(screen.getByRole('heading', { name: 'Reports' })).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('hides accruals link in reports tab when user lacks AccrualViewer role', async () => {
    const managedPis = [
      { employeeId: '2001', name: 'PI One', projectCount: 1 },
    ];

    const user = {
      email: 'alpha@example.com',
      employeeId: '1000',
      id: 'user-1',
      kerberos: 'alpha',
      name: 'Alpha User',
      roles: [],
    };

    server.use(
      http.get('/api/user/me', () => HttpResponse.json(user)),
      http.get('/api/project/managed/:employeeId', () =>
        HttpResponse.json(managedPis)
      ),
      http.get('/api/project/:employeeId', () => HttpResponse.json([])),
      http.get('/api/project/personnel', () => HttpResponse.json([])),
    );

    const ue = userEvent.setup();
    const { cleanup } = renderRoute({ initialPath: '/' });

    try {
      await screen.findByText('PI One');

      await ue.click(screen.getByRole('tab', { name: 'Reports' }));

      expect(
        screen.queryByText('Employee Vacation Accruals')
      ).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('switches between all tabs', async () => {
    const managedPis = [
      { employeeId: '2001', name: 'PI One', projectCount: 2 },
    ];

    const projects = [
      {
        awardEndDate: '2099-12-31',
        catBudBal: 1000,
        displayName: 'P1: Project One',
        projectName: 'Project One',
        projectNumber: 'P1',
      },
    ];

    const testUser = {
      email: 'alpha@example.com',
      employeeId: '1000',
      id: 'user-1',
      kerberos: 'alpha',
      name: 'Alpha User',
      roles: ['Admin'],
    };

    server.use(
      http.get('/api/project/managed/:employeeId', () =>
        HttpResponse.json(managedPis)
      ),
      http.get('/api/project/:employeeId', () => HttpResponse.json(projects)),
      http.get('/api/user/me', () => HttpResponse.json(testUser)),
      http.get('/api/project/personnel', () => HttpResponse.json([]))
    );

    const user = userEvent.setup();
    const { cleanup } = renderRoute({ initialPath: '/' });

    try {
      // Wait for initial render - PIs tab is active by default when user is a PM
      await screen.findByText('PI One');
      expect(
        screen.getByRole('tab', { name: 'Principal Investigators' })
      ).toHaveAttribute('aria-selected', 'true');

      // Click Reports tab
      await user.click(screen.getByRole('tab', { name: 'Reports' }));
      expect(
        screen.getByText('Employee Vacation Accruals')
      ).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Reports' })).toHaveAttribute(
        'aria-selected',
        'true'
      );

      // Click back to PIs tab
      await user.click(
        screen.getByRole('tab', { name: 'Principal Investigators' })
      );
      expect(screen.getByText('PI One')).toBeInTheDocument();
      expect(
        screen.getByRole('tab', { name: 'Principal Investigators' })
      ).toHaveAttribute('aria-selected', 'true');
    } finally {
      cleanup();
    }
  });
});

describe('getPiProjectAlerts', () => {
  it('returns error for negative balance', () => {
    const pis = [
      createPi('1', [
        {
          catBudBal: -500,
          catBudget: 1000,
          displayName: 'P1: Project One',
          projectName: 'Project One',
          projectNumber: 'P1',
        },
      ]),
    ];

    const alerts = getPiProjectAlerts(pis);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('error');
    expect(alerts[0].message).toContain('negative balance');
  });

  it('returns warning for less than 10% budget remaining', () => {
    const pis = [
      createPi('1', [
        {
          catBudBal: 50,
          catBudget: 1000,
          displayName: 'P1: Project One',
          projectName: 'Project One',
          projectNumber: 'P1',
        },
      ]),
    ];

    const alerts = getPiProjectAlerts(pis);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('warning');
    expect(alerts[0].message).toContain('less than 10%');
  });

  it('returns no alert for healthy budget', () => {
    const pis = [
      createPi('1', [
        {
          catBudBal: 500,
          catBudget: 1000,
          displayName: 'P1: Project One',
          projectName: 'Project One',
          projectNumber: 'P1',
        },
      ]),
    ];

    const alerts = getPiProjectAlerts(pis);

    expect(alerts).toHaveLength(0);
  });

  it('sorts errors before warnings', () => {
    const pis = [
      createPi('1', [
        {
          catBudBal: 50,
          catBudget: 1000,
          displayName: 'P1: Warning Project',
          projectName: 'Warning Project',
          projectNumber: 'P1',
        },
        {
          catBudBal: -100,
          catBudget: 1000,
          displayName: 'P2: Error Project',
          projectName: 'Error Project',
          projectNumber: 'P2',
        },
      ]),
    ];

    const alerts = getPiProjectAlerts(pis);

    expect(alerts[0].severity).toBe('error');
    expect(alerts[1].severity).toBe('warning');
  });

  it('limits to 3 alerts', () => {
    const pis = [
      createPi('1', [
        {
          catBudBal: -100,
          catBudget: 1000,
          displayName: 'P1: Project 1',
          projectName: 'Project 1',
          projectNumber: 'P1',
        },
        {
          catBudBal: -200,
          catBudget: 1000,
          displayName: 'P2: Project 2',
          projectName: 'Project 2',
          projectNumber: 'P2',
        },
        {
          catBudBal: -300,
          catBudget: 1000,
          displayName: 'P3: Project 3',
          projectName: 'Project 3',
          projectNumber: 'P3',
        },
        {
          catBudBal: -400,
          catBudget: 1000,
          displayName: 'P4: Project 4',
          projectName: 'Project 4',
          projectNumber: 'P4',
        },
      ]),
    ];

    const alerts = getPiProjectAlerts(pis);

    expect(alerts).toHaveLength(3);
  });
});
