import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
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
    } finally {
      cleanup();
    }
  });

  it('navigates to the department drilldown when a department row is clicked', async () => {
    const user = userEvent.setup();

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
      expect(screen.getByText('Gradziel,Thomas M')).toBeInTheDocument();
      expect(screen.getByText('Saichaie,Amanda M')).toBeInTheDocument();
      expect(screen.queryByText('Preview')).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });
});
