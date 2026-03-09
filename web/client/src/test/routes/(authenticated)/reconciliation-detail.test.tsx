import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { GLPPMReconciliationRecord } from '@/queries/project.ts';
import { server } from '@/test/mswUtils.ts';
import { renderRoute } from '@/test/routerUtils.tsx';

const createReconciliationRecord = (
  overrides: Partial<GLPPMReconciliationRecord> = {}
): GLPPMReconciliationRecord => ({
  activityCode: '000000',
  activityDescription: 'Default Activity',
  dataSource: 'Both',
  financialDepartment: 'DEPT001',
  fundCode: '13U02',
  fundDescription: 'Federal Fund',
  glActualAmount: -500.25,
  ppmBudBal: 1500.75,
  ppmBudget: 10000,
  ppmCommitments: 200,
  ppmFundCode: '13U02',
  ppmItdExp: 8299.25,
  programCode: '000',
  programDescription: 'Default Program',
  project: 'PROJ001',
  projectDescription: 'Test Project',
  remainingBalance: 1000.5,
  ...overrides,
});

const setupHandlers = (
  reconciliation: GLPPMReconciliationRecord[] = []
) => {
  server.use(
    http.get('/api/user/me', () =>
      HttpResponse.json({
        email: 'test@example.com',
        employeeId: '1000',
        id: 'user-1',
        kerberos: 'testuser',
        name: 'Test User',
        roles: ['admin'],
      })
    ),
    http.get('/api/project/byNumber', () => HttpResponse.json([])),
    http.get('/api/project/gl-ppm-reconciliation', () =>
      HttpResponse.json(reconciliation)
    ),
    http.get('/api/project/transactions', () => HttpResponse.json([]))
  );
};

const detailPath =
  '/reports/reconciliation/PROJ001/detail?dept=DEPT001&fund=13U02&program=000&activity=000000';

describe('reconciliation detail page', () => {
  it('shows PPM balance, GL actuals, and difference from record data', async () => {
    const record = createReconciliationRecord({
      glActualAmount: -500.25,
      ppmBudBal: 1500.75,
    });
    setupHandlers([record]);

    const { cleanup } = renderRoute({ initialPath: detailPath });

    try {
      expect(await screen.findByText('PPM')).toBeInTheDocument();
      expect(screen.getByText('$1,500.75')).toBeInTheDocument();
      expect(screen.getByText('GL')).toBeInTheDocument();
      expect(screen.getByText('-$500.25')).toBeInTheDocument();
      expect(screen.getByText('Difference')).toBeInTheDocument();
      expect(screen.getByText('$1,000.50')).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('shows no record found when reconciliation data is empty', async () => {
    setupHandlers([]);

    const { cleanup } = renderRoute({ initialPath: detailPath });

    try {
      expect(await screen.findByText('No record found.')).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });
});