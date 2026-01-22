import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mswUtils.ts';
import { renderRoute } from '@/test/routerUtils.tsx';

const mockUser = {
  email: 'test@example.com',
  employeeId: '1000',
  id: 'user-1',
  kerberos: 'testuser',
  name: 'Test User',
  roles: ['admin'],
};

describe('personnel page', () => {
  it('calculates summary stats correctly', async () => {
    const personnel = [
      {
        emplid: '1001',
        name: 'Smith,John',
        projectId: 'PROJ1',
        projectName: 'Project One',
        positionDescr: 'PROF-FY',
        monthlyRt: 5000,
        distPct: 100,
        cbr: 0.4,
        fundingEndDt: '2026-12-31T00:00:00.000Z',
        fte: 1.0,
      },
      {
        emplid: '1001',
        name: 'Smith,John',
        projectId: 'PROJ2',
        projectName: 'Project Two',
        positionDescr: 'PROF-FY',
        monthlyRt: 3000,
        distPct: 50,
        cbr: 0.4,
        fundingEndDt: '2027-06-30T00:00:00.000Z',
        fte: 0.5,
      },
      {
        emplid: '1002',
        name: 'Doe,Jane',
        projectId: 'PROJ1',
        projectName: 'Project One',
        positionDescr: 'POSTDOC-EMPLOYEE',
        monthlyRt: 4000,
        distPct: 100,
        cbr: 0.4,
        fundingEndDt: '2026-09-30T00:00:00.000Z',
        fte: 1.0,
      },
    ];

    server.use(
      http.get('/api/user/me', () => HttpResponse.json(mockUser)),
      http.get('/api/project/personnel', () => HttpResponse.json(personnel))
    );

    const { cleanup } = renderRoute({ initialPath: '/personnel' });

    try {
      // Wait for page to load
      await screen.findByText("Test User's Personnel");

      // Should show 2 unique employees
      expect(screen.getByText('2 employees across 2 projects')).toBeInTheDocument();

      // Summary cards should show correct values
      // # of Employees: 2
      const employeeCards = screen.getAllByText('2');
      expect(employeeCards.length).toBeGreaterThanOrEqual(2); // In card and subtitle

      // Total Salary: (5000 + 3000 + 4000) * 12 = 144000
      // Appears in both summary card and table footer
      expect(screen.getAllByText('$144,000.00').length).toBeGreaterThanOrEqual(1);

      // Total Fringe: 144000 * 0.4 = 57600
      expect(screen.getAllByText('$57,600.00').length).toBeGreaterThanOrEqual(1);
    } finally {
      cleanup();
    }
  });
});

