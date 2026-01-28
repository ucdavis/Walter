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
        employeeId: '1001',
        name: 'Smith, John',
        projectId: 'PROJ1',
        projectDescription: 'Project One',
        positionNumber: '40001234',
        positionDescription: 'PROF-FY',
        monthlyRate: 5000,
        distributionPercent: 100,
        compositeBenefitRate: 0.4,
        fte: 1.0,
        positionEffectiveDate: '2020-01-01T00:00:00.000Z',
        jobEndDate: null,
        fundingEffectiveDate: '2025-07-01T00:00:00.000Z',
        fundingEndDate: '2026-12-31T00:00:00.000Z',
      },
      {
        employeeId: '1001',
        name: 'Smith, John',
        projectId: 'PROJ2',
        projectDescription: 'Project Two',
        positionNumber: '40009999',
        positionDescription: 'ASSOC PROF-FY',
        monthlyRate: 3000,
        distributionPercent: 50,
        compositeBenefitRate: 0.4,
        fte: 0.5,
        positionEffectiveDate: '2020-01-01T00:00:00.000Z',
        jobEndDate: null,
        fundingEffectiveDate: '2025-07-01T00:00:00.000Z',
        fundingEndDate: '2027-06-30T00:00:00.000Z',
      },
      {
        employeeId: '1002',
        name: 'Doe, Jane',
        projectId: 'PROJ1',
        projectDescription: 'Project One',
        positionNumber: '40005678',
        positionDescription: 'POSTDOC-EMPLOYEE',
        monthlyRate: 4000,
        distributionPercent: 100,
        compositeBenefitRate: 0.4,
        fte: 1.0,
        positionEffectiveDate: '2023-09-01T00:00:00.000Z',
        jobEndDate: '2026-08-31T00:00:00.000Z',
        fundingEffectiveDate: '2025-07-01T00:00:00.000Z',
        fundingEndDate: '2026-09-30T00:00:00.000Z',
      },
    ];

    // Mock the projects endpoint to provide project codes for personnel query
    const projects = [
      {
        projectNumber: 'PROJ1',
        projectName: 'Project One',
        catBudBal: 1000,
        awardEndDate: null,
      },
      {
        projectNumber: 'PROJ2',
        projectName: 'Project Two',
        catBudBal: 2000,
        awardEndDate: null,
      },
    ];

    server.use(
      http.get('/api/user/me', () => HttpResponse.json(mockUser)),
      // Personnel handler must be before :employeeId to avoid conflict
      http.get('/api/project/personnel', () => HttpResponse.json(personnel)),
      http.get('/api/project/:employeeId', () => HttpResponse.json(projects))
    );

    const { cleanup } = renderRoute({ initialPath: '/personnel' });

    try {
      // Wait for page to load
      await screen.findByText("Test User's Personnel");

      // Should show 2 unique employees
      expect(
        screen.getByText('2 employees across 2 projects')
      ).toBeInTheDocument();

      // Summary cards should show correct values
      // # of Employees: 2
      const employeeCards = screen.getAllByText('2');
      expect(employeeCards.length).toBeGreaterThanOrEqual(2); // In card and subtitle

      // Monthly Rate: 5000 + 3000 + 4000 = 12000
      // Appears in both summary card and table footer
      expect(screen.getAllByText('$12,000.00').length).toBeGreaterThanOrEqual(
        1
      );

      // Monthly Fringe: 12000 * 0.4 = 4800
      expect(screen.getAllByText('$4,800.00').length).toBeGreaterThanOrEqual(1);
    } finally {
      cleanup();
    }
  });
});
