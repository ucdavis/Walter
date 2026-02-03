import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { getPiProjectAlerts } from '@/lib/projectAlerts.ts';
import { PiWithProjects } from '@/queries/project.ts';
import { server } from '@/test/mswUtils.ts';
import { renderRoute } from '@/test/routerUtils.tsx';

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
        projectNumber: 'P1',
        projectName: 'Project One',
        awardEndDate: '2099-12-31',
        catBudBal: 1000,
      },
      {
        projectNumber: 'P2',
        projectName: 'Project Two',
        awardEndDate: null,
        catBudBal: 2000,
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
      expect(await screen.findByText('Project One')).toBeInTheDocument();
      expect(await screen.findByText('Project Two')).toBeInTheDocument();
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
        projectNumber: 'P1',
        projectName: 'Project One',
        awardEndDate: '2099-12-31',
        catBudBal: 1000,
      },
      {
        projectNumber: 'P1',
        projectName: 'Project One',
        awardEndDate: '2099-12-31',
        catBudBal: 500,
      },
      {
        projectNumber: 'P1',
        projectName: 'Project One',
        awardEndDate: '2099-12-31',
        catBudBal: 250,
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
      await screen.findByText('Project One');
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

  it('switches between all tabs', async () => {
    const managedPis = [
      { employeeId: '2001', name: 'PI One', projectCount: 2 },
    ];

    const projects = [
      {
        projectNumber: 'P1',
        projectName: 'Project One',
        awardEndDate: '2099-12-31',
        catBudBal: 1000,
      },
    ];

    const testUser = {
      email: 'alpha@example.com',
      employeeId: '1000',
      id: 'user-1',
      kerberos: 'alpha',
      name: 'Alpha User',
      roles: ['admin'],
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

      // Click Personnel tab
      await user.click(screen.getByRole('tab', { name: 'Personnel' }));
      expect(
        screen.getByRole('tabpanel', { name: /personnel/i })
      ).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Personnel' })).toHaveAttribute(
        'aria-selected',
        'true'
      );

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
  const createPi = (
    employeeId: string,
    projects: Array<{
      projectNumber: string;
      projectName: string;
      catBudget: number;
      catBudBal: number;
    }>
  ): PiWithProjects => ({
    employeeId,
    name: `PI ${employeeId}`,
    projectCount: projects.length,
    projects: projects as PiWithProjects['projects'],
    totalBalance: projects.reduce((sum, p) => sum + p.catBudBal, 0),
    totalBudget: projects.reduce((sum, p) => sum + p.catBudget, 0),
  });

  it('returns error for negative balance', () => {
    const pis = [
      createPi('1', [
        {
          projectNumber: 'P1',
          projectName: 'Project One',
          catBudget: 1000,
          catBudBal: -500,
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
          projectNumber: 'P1',
          projectName: 'Project One',
          catBudget: 1000,
          catBudBal: 50,
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
          projectNumber: 'P1',
          projectName: 'Project One',
          catBudget: 1000,
          catBudBal: 500,
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
          projectNumber: 'P1',
          projectName: 'Warning Project',
          catBudget: 1000,
          catBudBal: 50,
        },
        {
          projectNumber: 'P2',
          projectName: 'Error Project',
          catBudget: 1000,
          catBudBal: -100,
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
          projectNumber: 'P1',
          projectName: 'Project 1',
          catBudget: 1000,
          catBudBal: -100,
        },
        {
          projectNumber: 'P2',
          projectName: 'Project 2',
          catBudget: 1000,
          catBudBal: -200,
        },
        {
          projectNumber: 'P3',
          projectName: 'Project 3',
          catBudget: 1000,
          catBudBal: -300,
        },
        {
          projectNumber: 'P4',
          projectName: 'Project 4',
          catBudget: 1000,
          catBudBal: -400,
        },
      ]),
    ];

    const alerts = getPiProjectAlerts(pis);

    expect(alerts).toHaveLength(3);
  });
});
