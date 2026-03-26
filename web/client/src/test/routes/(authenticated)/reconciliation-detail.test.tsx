import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type {
  GLPPMReconciliationRecord,
  GLTransactionRecord,
} from '@/queries/project.ts';
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

const createTransaction = (
  overrides: Partial<GLTransactionRecord> = {}
): GLTransactionRecord => ({
  account: '500001',
  accountDescription: 'Supplies',
  accountingSequenceNumber: null,
  activity: '000000',
  activityDescription: 'Default Activity',
  actualAmount: 100,
  actualFlag: 'A',
  batchStatus: 'P',
  commitmentAmount: 0,
  documentType: null,
  encumbranceTypeCode: null,
  entity: 'ENTITY',
  entityDescription: null,
  financialDepartment: 'DEPT001',
  financialDepartmentDescription: null,
  fund: '13U02',
  fundDescription: null,
  journalAcctDate: '2026-01-15',
  journalBatchName: null,
  journalCategory: null,
  journalLineDescription: 'Test transaction',
  journalName: 'JE001',
  journalReference: null,
  journalSource: null,
  naturalAccountType: null,
  obligationAmount: 0,
  periodName: null,
  program: '000',
  programDescription: null,
  project: 'PROJ001',
  projectDescription: null,
  purpose: null,
  purposeDescription: null,
  reference: null,
  trackingNo: null,
  ...overrides,
});

const setupHandlers = (
  reconciliation: GLPPMReconciliationRecord[] = [],
  transactions: GLTransactionRecord[] = []
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
    http.get('/api/project/transactions', () =>
      HttpResponse.json(transactions)
    )
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

  it('renders filter buttons and filters transactions by account type', async () => {
    const user = userEvent.setup();
    const record = createReconciliationRecord();
    const txns = [
      createTransaction({
        actualAmount: -1000,
        journalLineDescription: 'Grant revenue',
        naturalAccountType: '40000',
      }),
      createTransaction({
        actualAmount: 250,
        journalLineDescription: 'Lab supplies',
        naturalAccountType: '50000',
      }),
      createTransaction({
        actualAmount: 150,
        journalLineDescription: 'Travel expense',
        naturalAccountType: '54000',
      }),
    ];
    setupHandlers([record], txns);

    const { cleanup } = renderRoute({ initialPath: detailPath });

    try {
      // Wait for data to load — all 3 transactions visible
      expect(
        await screen.findByText('GL Transactions (3)')
      ).toBeInTheDocument();

      // Filter to revenue
      await user.click(screen.getByRole('button', { name: 'Revenue' }));
      expect(screen.getByText('GL Transactions (1)')).toBeInTheDocument();
      expect(screen.getByText('Grant revenue')).toBeInTheDocument();

      // Filter to expenses
      await user.click(screen.getByRole('button', { name: 'Expenses' }));
      expect(screen.getByText('GL Transactions (2)')).toBeInTheDocument();
      expect(screen.getByText('Lab supplies')).toBeInTheDocument();
      expect(screen.getByText('Travel expense')).toBeInTheDocument();

      // Back to all
      await user.click(screen.getByRole('button', { name: 'All' }));
      expect(screen.getByText('GL Transactions (3)')).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });
});