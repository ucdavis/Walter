import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
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
              headcount: 21,
              lostCostMonth: 2496,
              lostCostYtd: 22464,
            },
            {
              avgBalanceHours: 143,
              approachingCapCount: 3,
              atCapCount: 1,
              department: 'NUTRITION',
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
});
