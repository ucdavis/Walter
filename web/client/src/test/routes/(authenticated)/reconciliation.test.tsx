import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
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
  glActualAmount: 50,
  ppmBudBal: -50,
  ppmBudget: 10_000,
  ppmFundCode: '13U02',
  ppmFundDescription: 'COFI University Common Funds',
  ppmItdExp: 9950,
  programCode: '000',
  programDescription: 'Default Program',
  project: 'P1',
  projectDescription: 'Test Project',
  remainingBalance: 0,
  ...overrides,
});

const setupHandlers = (records: GLPPMReconciliationRecord[]) => {
  server.use(
    http.get('/api/user/me', () =>
      HttpResponse.json({
        email: 'test@example.com',
        employeeId: '1000',
        iamId: 'IAM-1000',
        id: 'user-1',
        kerberos: 'testuser',
        name: 'Test User',
        roles: ['FinancialViewer'],
      })
    ),
    http.get('/api/project/gl-ppm-reconciliation', () =>
      HttpResponse.json(records)
    )
  );
};

const dataRows = () => screen.getAllByRole('row').slice(1);

describe('reconciliation route', () => {
  it('renders rows sorted by fund, program, activity', async () => {
    setupHandlers([
      createReconciliationRecord({ fundCode: 'F2' }),
      createReconciliationRecord({ fundCode: 'F1' }),
    ]);

    const { cleanup } = renderRoute({
      initialPath: '/reports/reconciliation/P1',
    });

    try {
      await screen.findByText('F1');
      const rows = dataRows();
      expect(within(rows[0]).getByText('F1')).toBeInTheDocument();
      expect(within(rows[1]).getByText('F2')).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('highlights out-of-balance rows and shows the difference', async () => {
    setupHandlers([
      createReconciliationRecord({
        fundCode: 'F1',
        glActualAmount: -100,
        ppmBudBal: 0,
      }),
      createReconciliationRecord({ fundCode: 'F2' }),
    ]);

    const { cleanup } = renderRoute({
      initialPath: '/reports/reconciliation/P1',
    });

    try {
      await screen.findByText('F1');
      const [outOfBalance, balanced] = dataRows();
      expect(outOfBalance).toHaveClass('bg-info/10');
      expect(within(outOfBalance).getAllByText('-$100.00').length).toBe(2);
      expect(balanced).not.toHaveClass('bg-info/10');
    } finally {
      cleanup();
    }
  });

  it('links Details to the chart string detail page', async () => {
    setupHandlers([createReconciliationRecord()]);

    const { cleanup } = renderRoute({
      initialPath: '/reports/reconciliation/P1',
    });

    try {
      const [details] = await screen.findAllByRole('link', {
        name: 'Details',
      });
      expect(details.getAttribute('href')).toContain(
        '/reports/reconciliation/P1/detail'
      );
    } finally {
      cleanup();
    }
  });

  it('shows the in-sync banner when nothing is out of balance', async () => {
    setupHandlers([createReconciliationRecord()]);

    const { cleanup } = renderRoute({
      initialPath: '/reports/reconciliation/P1',
    });

    try {
      expect(
        await screen.findByText(
          'No discrepancies found. GL and PPM totals are in sync.'
        )
      ).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });
});
