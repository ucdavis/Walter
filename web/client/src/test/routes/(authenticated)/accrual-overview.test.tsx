import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mswUtils.ts';
import { renderRoute } from '@/test/routerUtils.tsx';

const mockUser = {
  email: 'accruals@example.com',
  employeeId: '1000',
  id: 'user-1',
  kerberos: 'accruals',
  name: 'Accrual Viewer',
  roles: ['AccrualViewer'],
};

const mockAccrualAssumptions = {
  approachingThresholdPct: 80,
  atCapThresholdPct: 96,
  benefitsRates: [
    { label: 'FY Acad Admin', rate: 0.41 },
    { label: 'FY Acad Coord', rate: 0.41 },
    { label: 'FY Faculty', rate: 0.41 },
    { label: 'All other classes', rate: 0.51 },
  ],
  fallbackAccrualTiers: [
    { label: '384+ cap hours', monthlyAccrualHours: 16 },
    { label: '368+ cap hours', monthlyAccrualHours: 15.33 },
    { label: '352+ cap hours', monthlyAccrualHours: 14.67 },
    { label: '336+ cap hours', monthlyAccrualHours: 14 },
    { label: '320+ cap hours', monthlyAccrualHours: 13.33 },
    { label: '288+ cap hours', monthlyAccrualHours: 12 },
    { label: '240+ cap hours', monthlyAccrualHours: 10 },
    { label: 'Below 240 cap hours', monthlyAccrualHours: 10 },
  ],
  hourlyRates: [
    { label: 'FY Acad Admin', hourlyRate: 65 },
    { label: 'FY Acad Coord', hourlyRate: 62 },
    { label: 'FY Faculty', hourlyRate: 78 },
    { label: 'FY Researcher', hourlyRate: 68 },
    { label: 'MSP', hourlyRate: 52 },
    { label: 'PSS', hourlyRate: 32.5 },
    { label: 'SMG', hourlyRate: 72 },
    { label: 'Fallback academic', hourlyRate: 70 },
    { label: 'Fallback staff', hourlyRate: 45 },
  ],
};

describe('vacation accrual overview route', () => {
  it('renders the college overview cards, charts, and table', async () => {
    server.use(
      http.get('/api/user/me', () => HttpResponse.json(mockUser)),
      http.get('/api/accrual/overview', () =>
        HttpResponse.json({
          approachingCapCount: 7,
          asOfDate: '2026-03-31T00:00:00',
          atCapCount: 3,
          departmentBreakdown: [
            {
              avgBalanceHours: 178,
              approachingCapCount: 4,
              atCapCount: 2,
              department: 'PLANT SCIENCES',
              departmentCode: '030003',
              headcount: 21,
              lostCostMonth: 2496,
              lostCostYtd: 22464,
            },
            {
              avgBalanceHours: 143,
              approachingCapCount: 3,
              atCapCount: 1,
              department: 'NUTRITION',
              departmentCode: '030090',
              headcount: 12,
              lostCostMonth: 1321,
              lostCostYtd: 11889,
            },
          ],
          employeeStatusOverTime: [
            {
              active: 20,
              approaching: 5,
              asOfDate: '2026-02-28T00:00:00',
              atCap: 2,
              label: 'Feb 26',
            },
            {
              active: 23,
              approaching: 7,
              asOfDate: '2026-03-31T00:00:00',
              atCap: 3,
              label: 'Mar 26',
            },
          ],
          lostCostMonth: 3817,
          lostCostYtd: 34353,
          monthlyLostCost: [
            {
              asOfDate: '2026-02-28T00:00:00',
              label: 'Feb 26',
              lostCost: 2750,
            },
            {
              asOfDate: '2026-03-31T00:00:00',
              label: 'Mar 26',
              lostCost: 3817,
            },
          ],
          totalDepartments: 2,
          totalEmployees: 33,
          wasteRate: 3.1,
          ytdMonthCount: 9,
        })
      ),
    );

    const { cleanup } = renderRoute({ initialPath: '/accruals' });

    try {
      expect(
        await screen.findByRole('heading', {
          name: 'Vacation Accrual Overview',
        })
      ).toBeInTheDocument();
      expect(screen.getByText('Lost Cost (Month)')).toBeInTheDocument();
      expect(screen.getByText('Department Breakdown')).toBeInTheDocument();
      expect(screen.getByText('PLANT SCIENCES')).toBeInTheDocument();
      expect(screen.getByText('CAES Total')).toBeInTheDocument();
      expect(screen.getAllByText('$3,817.00')).toHaveLength(2);
      expect(screen.getByText('3.1%')).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'About this report' })
      ).toHaveAttribute('href', '/accruals/about');
    } finally {
      cleanup();
    }
  });

  it('renders the accrual assumptions page', async () => {
    server.use(
      http.get('/api/user/me', () => HttpResponse.json(mockUser)),
      http.get('/api/accrual/assumptions', () =>
        HttpResponse.json(mockAccrualAssumptions)
      )
    );

    const { cleanup } = renderRoute({ initialPath: '/accruals/about' });

    try {
      expect(
        await screen.findByRole('heading', { name: 'About This Report' })
      ).toBeInTheDocument();
      expect(screen.getByText('Lost Cost Formula')).toBeInTheDocument();
      expect(screen.getByText('Status Thresholds')).toBeInTheDocument();
      expect(screen.getByText('Benefits Loads')).toBeInTheDocument();
      expect(screen.getByText('96.0% and above')).toBeInTheDocument();
      expect(screen.getAllByText('41% composite benefits load')).toHaveLength(3);
      expect(
        screen.getByText('51% composite benefits load')
      ).toBeInTheDocument();
      expect(screen.getByText('$78.00/hr')).toBeInTheDocument();
      expect(screen.getByText('14.67 hrs/month')).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: /Back to Overview/i })
      ).toHaveAttribute('href', '/accruals');
    } finally {
      cleanup();
    }
  });

  it('shows the route error state when the accrual assumptions prefetch fails', async () => {
    server.use(
      http.get('/api/user/me', () => HttpResponse.json(mockUser)),
      http.get('/api/accrual/assumptions', () =>
        HttpResponse.json(
          { message: 'Assumptions unavailable' },
          { status: 503 }
        )
      )
    );

    const { cleanup } = renderRoute({ initialPath: '/accruals/about' });

    try {
      expect(
        await screen.findByRole('heading', { name: 'We could not reach the server' })
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'Try again in a moment. If the problem keeps happening, the service may be unavailable.'
        )
      ).toBeInTheDocument();
      expect(screen.getByText('Assumptions unavailable')).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: /Back to overview/i })
      ).toHaveAttribute('href', '/accruals');
    } finally {
      cleanup();
    }
  });

  it('navigates to the department drilldown when a department row is clicked', async () => {
    const user = userEvent.setup();

    server.use(
      http.get('/api/user/me', () => HttpResponse.json(mockUser)),
      http.get('/api/accrual/assumptions', () =>
        HttpResponse.json(mockAccrualAssumptions)
      ),
      http.get('/api/accrual/overview', () =>
        HttpResponse.json({
          approachingCapCount: 7,
          asOfDate: '2026-03-31T00:00:00',
          atCapCount: 3,
          departmentBreakdown: [
            {
              avgBalanceHours: 178,
              approachingCapCount: 4,
              atCapCount: 2,
              department: 'PLANT SCIENCES',
              departmentCode: '030003',
              headcount: 21,
              lostCostMonth: 2496,
              lostCostYtd: 22464,
            },
          ],
          employeeStatusOverTime: [],
          lostCostMonth: 2496,
          lostCostYtd: 22464,
          monthlyLostCost: [],
          totalDepartments: 1,
          totalEmployees: 21,
          wasteRate: 3.1,
          ytdMonthCount: 9,
        })
      ),
      http.get('/api/accrual/department/:departmentCode', ({ params }) => {
        if (params.departmentCode !== '030003') {
          return HttpResponse.json(
            { message: 'Not found' },
            { status: 404 }
          );
        }

        return HttpResponse.json({
          asOfDate: '2026-03-31T00:00:00',
          avgBalanceHours: 178,
          approachingCapCount: 4,
          atCapCount: 2,
          departmentCode: '030003',
          departmentName: 'PLANT SCIENCES',
          departments: [
            {
              code: '030003',
              name: 'PLANT SCIENCES',
            },
            {
              code: '030090',
              name: 'NUTRITION',
            },
          ],
          employees: [
            {
              accrualHoursPerMonth: 16,
              balanceHours: 384,
              capHours: 384,
              classification: 'FY Faculty',
              employeeId: '10206082',
              employeeName: 'Gradziel,Thomas M',
              lastVacationDate: '2026-01-31T00:00:00',
              lostCostMonth: 1248,
              monthsToCap: 0,
              pctOfCap: 100,
            },
            {
              accrualHoursPerMonth: 8,
              balanceHours: 322,
              capHours: 384,
              classification: 'PSS',
              employeeId: '10243193',
              employeeName: 'Saichaie,Amanda M',
              lastVacationDate: '2026-02-28T00:00:00',
              lostCostMonth: 0,
              monthsToCap: 3,
              pctOfCap: 83.9,
            },
          ],
          headcount: 21,
          lostCostMonth: 2496,
          lostCostYtd: 22464,
          ytdMonthCount: 9,
        });
      })
    );

    const { cleanup } = renderRoute({ initialPath: '/accruals' });

    try {
      const departmentCell = await screen.findByText('PLANT SCIENCES');
      const departmentRow = departmentCell.closest('tr');
      expect(departmentRow).not.toBeNull();

      await user.click(departmentRow!);

      expect(
        await screen.findByRole('link', { name: /College Overview/i })
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Department')).toHaveValue('030003');
      expect(
        screen.getByRole('link', { name: 'About this report' })
      ).toHaveAttribute('href', '/accruals/about');
      expect(screen.getByText('Gradziel,Thomas M')).toBeInTheDocument();
      expect(screen.getByText('Saichaie,Amanda M')).toBeInTheDocument();
      expect(screen.queryByText('Preview')).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('resets department filters when navigating between departments', async () => {
    const user = userEvent.setup();

    server.use(
      http.get('/api/user/me', () => HttpResponse.json(mockUser)),
      http.get('/api/accrual/assumptions', () =>
        HttpResponse.json(mockAccrualAssumptions)
      ),
      http.get('/api/accrual/overview', () =>
        HttpResponse.json({
          approachingCapCount: 7,
          asOfDate: '2026-03-31T00:00:00',
          atCapCount: 3,
          departmentBreakdown: [
            {
              avgBalanceHours: 178,
              approachingCapCount: 4,
              atCapCount: 2,
              department: 'PLANT SCIENCES',
              departmentCode: '030003',
              headcount: 21,
              lostCostMonth: 2496,
              lostCostYtd: 22464,
            },
            {
              avgBalanceHours: 143,
              approachingCapCount: 3,
              atCapCount: 1,
              department: 'NUTRITION',
              departmentCode: '030090',
              headcount: 12,
              lostCostMonth: 1321,
              lostCostYtd: 11889,
            },
          ],
          employeeStatusOverTime: [],
          lostCostMonth: 3817,
          lostCostYtd: 34353,
          monthlyLostCost: [],
          totalDepartments: 2,
          totalEmployees: 33,
          wasteRate: 3.1,
          ytdMonthCount: 9,
        })
      ),
      http.get('/api/accrual/department/:departmentCode', ({ params }) => {
        if (params.departmentCode === '030003') {
          return HttpResponse.json({
            asOfDate: '2026-03-31T00:00:00',
            avgBalanceHours: 178,
            approachingCapCount: 1,
            atCapCount: 1,
            departmentCode: '030003',
            departmentName: 'PLANT SCIENCES',
            departments: [
              {
                code: '030003',
                name: 'PLANT SCIENCES',
              },
              {
                code: '030090',
                name: 'NUTRITION',
              },
            ],
            employees: [
              {
                accrualHoursPerMonth: 16,
                balanceHours: 384,
                capHours: 384,
                classification: 'FY Faculty',
                employeeId: '10206082',
                employeeName: 'Gradziel,Thomas M',
                lastVacationDate: '2026-01-31T00:00:00',
                lostCostMonth: 1248,
                monthsToCap: 0,
                pctOfCap: 100,
              },
              {
                accrualHoursPerMonth: 8,
                balanceHours: 322,
                capHours: 384,
                classification: 'PSS',
                employeeId: '10243193',
                employeeName: 'Saichaie,Amanda M',
                lastVacationDate: '2026-02-28T00:00:00',
                lostCostMonth: 0,
                monthsToCap: 3,
                pctOfCap: 83.9,
              },
            ],
            headcount: 2,
            lostCostMonth: 1248,
            lostCostYtd: 1248,
            ytdMonthCount: 9,
          });
        }

        if (params.departmentCode === '030090') {
          return HttpResponse.json({
            asOfDate: '2026-03-31T00:00:00',
            avgBalanceHours: 143,
            approachingCapCount: 0,
            atCapCount: 1,
            departmentCode: '030090',
            departmentName: 'NUTRITION',
            departments: [
              {
                code: '030003',
                name: 'PLANT SCIENCES',
              },
              {
                code: '030090',
                name: 'NUTRITION',
              },
            ],
            employees: [
              {
                accrualHoursPerMonth: 12,
                balanceHours: 288,
                capHours: 288,
                classification: 'FY Faculty',
                employeeId: '10209999',
                employeeName: 'Faculty,Nutrition',
                lastVacationDate: '2026-02-28T00:00:00',
                lostCostMonth: 936,
                monthsToCap: 0,
                pctOfCap: 100,
              },
            ],
            headcount: 1,
            lostCostMonth: 936,
            lostCostYtd: 936,
            ytdMonthCount: 9,
          });
        }

        return HttpResponse.json({ message: 'Not found' }, { status: 404 });
      })
    );

    const { cleanup } = renderRoute({ initialPath: '/accruals' });

    try {
      const departmentCell = await screen.findByText('PLANT SCIENCES');
      const departmentRow = departmentCell.closest('tr');
      expect(departmentRow).not.toBeNull();

      await user.click(departmentRow!);

      expect(
        await screen.findByText('Saichaie,Amanda M')
      ).toBeInTheDocument();

      const classificationSelect = screen.getAllByRole('combobox')[1];
      await user.selectOptions(classificationSelect, 'PSS');

      expect(screen.getByText('Saichaie,Amanda M')).toBeInTheDocument();
      expect(screen.queryByText('Gradziel,Thomas M')).not.toBeInTheDocument();

      await user.selectOptions(screen.getByLabelText('Department'), '030090');

      expect(await screen.findByText('Faculty,Nutrition')).toBeInTheDocument();
      expect(
        screen.queryByText(
          'No employees are available for this department in the current accrual snapshot.'
        )
      ).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('uses the centralized threshold assumptions on the department detail page', async () => {
    server.use(
      http.get('/api/user/me', () => HttpResponse.json(mockUser)),
      http.get('/api/accrual/assumptions', () =>
        HttpResponse.json({
          ...mockAccrualAssumptions,
          approachingThresholdPct: 85,
          atCapThresholdPct: 95,
        })
      ),
      http.get('/api/accrual/department/:departmentCode', ({ params }) => {
        if (params.departmentCode !== '030003') {
          return HttpResponse.json({ message: 'Not found' }, { status: 404 });
        }

        return HttpResponse.json({
          asOfDate: '2026-03-31T00:00:00',
          avgBalanceHours: 178,
          approachingCapCount: 1,
          atCapCount: 1,
          departmentCode: '030003',
          departmentName: 'PLANT SCIENCES',
          departments: [
            {
              code: '030003',
              name: 'PLANT SCIENCES',
            },
          ],
          employees: [
            {
              accrualHoursPerMonth: 16,
              balanceHours: 365,
              capHours: 384,
              classification: 'FY Faculty',
              employeeId: '10206082',
              employeeName: 'Threshold,Casey',
              lastVacationDate: '2026-01-31T00:00:00',
              lostCostMonth: 1248,
              monthsToCap: 1,
              pctOfCap: 95,
            },
            {
              accrualHoursPerMonth: 8,
              balanceHours: 334,
              capHours: 384,
              classification: 'PSS',
              employeeId: '10243193',
              employeeName: 'Approach,Alex',
              lastVacationDate: '2026-02-28T00:00:00',
              lostCostMonth: 0,
              monthsToCap: 2,
              pctOfCap: 87,
            },
          ],
          headcount: 2,
          lostCostMonth: 1248,
          lostCostYtd: 1248,
          ytdMonthCount: 9,
        });
      })
    );

    const { cleanup } = renderRoute({
      initialPath: '/accruals/department/030003',
    });

    try {
      const atCapRow = (
        await screen.findByText('Threshold,Casey')
      ).closest('tr');
      const approachingRow = screen.getByText('Approach,Alex').closest('tr');

      expect(atCapRow).not.toBeNull();
      expect(approachingRow).not.toBeNull();
      expect(within(atCapRow!).getAllByText('At Cap').length).toBeGreaterThan(0);
      expect(
        within(approachingRow!).getAllByText('Approaching').length
      ).toBeGreaterThan(0);
    } finally {
      cleanup();
    }
  });
});
