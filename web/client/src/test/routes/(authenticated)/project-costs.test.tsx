import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { downloadExcelCsv } from '@/lib/csv.ts';
import type { ProjectRecord } from '@/queries/project.ts';
import type { ProjectCostRecord } from '@/queries/projectCosts.ts';
import { server } from '@/test/mswUtils.ts';
import { renderRoute } from '@/test/routerUtils.tsx';

vi.mock('@/lib/csv.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/csv.ts')>();
  return {
    ...actual,
    downloadExcelCsv: vi.fn(),
  };
});

beforeEach(() => {
  vi.mocked(downloadExcelCsv).mockClear();
});

const createProject = (
  overrides: Partial<ProjectRecord> = {}
): ProjectRecord => ({
  activityCode: null,
  activityDesc: 'Activity',
  awardCloseDate: null,
  awardEndDate: '2099-12-31',
  awardName: null,
  awardNumber: 'AWD001',
  awardPi: null,
  awardStartDate: '2024-01-01',
  awardStatus: null,
  awardType: null,
  balance: 4000,
  billingCycle: null,
  budget: 10_000,
  commitments: 1000,
  contractAdministrator: null,
  copi: null,
  costShareRequiredBySponsor: null,
  displayName: 'Test Project',
  expenditureCategoryName: null,
  expenses: 5000,
  flowThroughFundsAmount: null,
  flowThroughFundsEndDate: null,
  flowThroughFundsPrimarySponsor: null,
  flowThroughFundsReferenceAwardName: null,
  flowThroughFundsStartDate: null,
  fundCode: null,
  fundDesc: 'Federal',
  grantAdministrator: null,
  ownerName: null,
  pa: null,
  pi: 'PI Name',
  pm: 'PM Name',
  pmEmployeeId: '2000',
  postReportingPeriod: null,
  ppmBudBal: 4000,
  ppmBudget: 10_000,
  ppmCommitments: 1000,
  ppmExpenses: 5000,
  primarySponsorName: null,
  programCode: null,
  programDesc: 'Program',
  projectBurdenCostRate: null,
  projectBurdenScheduleBase: null,
  projectEndDate: null,
  projectFund: null,
  projectName: 'Test Project',
  projectNumber: 'P1',
  projectOwningOrg: 'ORG001',
  projectOwningOrgCode: 'ORG001',
  projectStartDate: null,
  projectStatusCode: 'ACTIVE',
  projectType: 'Sponsored',
  purposeDesc: 'Research',
  sponsorAwardNumber: null,
  taskName: 'Task 1',
  taskNum: 'T001',
  taskStatus: 'Active',
  ...overrides,
});

const createProjectCost = (
  overrides: Partial<ProjectCostRecord> = {}
): ProjectCostRecord => ({
  accountingDate: '2026-09-30T00:00:00',
  accountingPeriod: 'Sep-26',
  adjustingItem: null,
  awardEndDate: '2027-06-30T00:00:00',
  awardName: 'Test Award',
  awardNumber: 'AWD-1',
  awardStartDate: '2024-07-01T00:00:00',
  awardStatus: 'Active',
  awardType: 'Grant',
  billable: 'Yes',
  burdenedCost: 0,
  comment: null,
  document: 'Supplier Invoices',
  documentEntry: 'Supplier Invoice',
  expenditureBatch: 'BATCH-1',
  expenditureBusinessUnit: 'UCD Business Unit',
  expenditureCategory: '03 - Supplies / Services / Other Expenses',
  expenditureItemDate: '2026-09-15T00:00:00',
  expenditureOrgCode: 'ADNO001',
  expenditureOrgName: 'Test Department',
  expenditureType: '522860 - Technical Services',
  invoicedStatus: 'Not Invoiced',
  projectBusinessUnit: 'UCD Business Unit',
  projectEndDate: '2027-06-30T00:00:00',
  projectName: 'Test Project',
  projectNumber: 'P1',
  projectOwningOrgCode: 'ADNO001',
  projectOwningOrgName: 'Test Department',
  projectStartDate: '2024-07-01T00:00:00',
  projectStatus: 'Active',
  projectType: 'Sponsored',
  rawCost: 0,
  revenueStatus: 'Not Recognized',
  sourceTransactionNumber: null,
  taskActivityCode: null,
  taskActivityName: null,
  taskFundCode: null,
  taskFundName: null,
  taskName: 'Test Task',
  taskNumber: 'TASK01',
  taskProgramCode: null,
  taskProgramName: null,
  taskPurposeCode: null,
  taskPurposeName: null,
  taskStatus: 'Active',
  transactionNumber: 1,
  transferredFromTransactionNumber: null,
  ...overrides,
});

const projectCostRecords: ProjectCostRecord[] = [
  createProjectCost({
    accountingPeriod: 'Oct-25',
    burdenedCost: 1125.8,
    documentEntry: 'Prior Period Allocation',
    expenditureCategory: '09 - Indirect Costs',
    expenditureType: '538100 - Sponsored Program Indirect Costs',
    transactionNumber: 1001,
  }),
  createProjectCost({
    accountingPeriod: 'Nov-25',
    burdenedCost: 2340.2,
    documentEntry: 'Service Invoice',
    expenditureCategory: '03 - Supplies / Services / Other Expenses',
    expenditureType: '522860 - Technical Services',
    transactionNumber: 1002,
  }),
  createProjectCost({
    accountingPeriod: 'Dec-25',
    burdenedCost: 975.45,
    documentEntry: 'Equipment Rental',
    expenditureCategory: '03 - Supplies / Services / Other Expenses',
    expenditureType: '522840 - Equipment Rental',
    transactionNumber: 1003,
  }),
  createProjectCost({
    accountingPeriod: 'Jan-26',
    burdenedCost: 1740.26,
    documentEntry: 'Benefits Allocation',
    expenditureCategory: '02 - Fringe Benefits',
    expenditureType: '508110 - Employee Benefits Pool',
    transactionNumber: 1004,
  }),
  createProjectCost({
    accountingPeriod: 'Feb-26',
    burdenedCost: 725.1,
    documentEntry: 'Travel Reimbursement',
    expenditureCategory: '07 - Travel',
    expenditureType: '523220 - Field Research Travel',
    transactionNumber: 1005,
  }),
  createProjectCost({
    accountingPeriod: 'Mar-26',
    burdenedCost: 1280.4,
    documentEntry: 'Purchase Order Invoice',
    expenditureCategory: '03 - Supplies / Services / Other Expenses',
    expenditureType: '522810 - Research Materials',
    transactionNumber: 1006,
  }),
  createProjectCost({
    accountingPeriod: 'Apr-26',
    burdenedCost: 12_785.42,
    documentEntry: 'Payroll Distribution',
    expenditureCategory: '01 - Salaries and Wages',
    expenditureType: '501010 - Research Personnel Salary',
    transactionNumber: 1007,
  }),
  createProjectCost({
    accountingPeriod: 'Apr-26',
    burdenedCost: 4116.25,
    documentEntry: 'Benefits Allocation',
    expenditureCategory: '02 - Fringe Benefits',
    expenditureType: '508110 - Employee Benefits Pool',
    transactionNumber: 1008,
  }),
  createProjectCost({
    accountingPeriod: 'Apr-26',
    burdenedCost: 986.7,
    documentEntry: 'Supplier Invoice',
    expenditureCategory: '03 - Supplies / Services / Other Expenses',
    expenditureType: '522810 - Research Materials',
    transactionNumber: 1009,
  }),
  createProjectCost({
    accountingPeriod: 'Apr-26',
    burdenedCost: 2975.34,
    documentEntry: 'Indirect Cost Allocation',
    expenditureCategory: '09 - Indirect Costs',
    expenditureType: '538100 - Sponsored Program Indirect Costs',
    transactionNumber: 1010,
  }),
  createProjectCost({
    accountingPeriod: 'May-26',
    burdenedCost: 13_124.18,
    documentEntry: 'Payroll Distribution',
    expenditureCategory: '01 - Salaries and Wages',
    expenditureType: '501010 - Research Personnel Salary',
    transactionNumber: 1011,
  }),
  createProjectCost({
    accountingPeriod: 'May-26',
    burdenedCost: 4235.71,
    documentEntry: 'Benefits Allocation',
    expenditureCategory: '02 - Fringe Benefits',
    expenditureType: '508110 - Employee Benefits Pool',
    transactionNumber: 1012,
  }),
  createProjectCost({
    accountingPeriod: 'May-26',
    burdenedCost: 684.9,
    documentEntry: 'Travel Reimbursement',
    expenditureCategory: '07 - Travel',
    expenditureType: '523210 - Domestic Conference Travel',
    transactionNumber: 1013,
  }),
  createProjectCost({
    accountingPeriod: 'May-26',
    burdenedCost: 1148.32,
    documentEntry: 'Purchase Order Invoice',
    expenditureCategory: '03 - Supplies / Services / Other Expenses',
    expenditureType: '522830 - Specialized Equipment',
    transactionNumber: 1014,
  }),
  createProjectCost({
    accountingPeriod: 'May-26',
    burdenedCost: 3144.76,
    documentEntry: 'Indirect Cost Allocation',
    expenditureCategory: '09 - Indirect Costs',
    expenditureType: '538100 - Sponsored Program Indirect Costs',
    transactionNumber: 1015,
  }),
  createProjectCost({
    accountingPeriod: 'Jun-26',
    burdenedCost: 12_934.66,
    documentEntry: 'Payroll Distribution',
    expenditureCategory: '01 - Salaries and Wages',
    expenditureType: '501010 - Research Personnel Salary',
    transactionNumber: 1016,
  }),
  createProjectCost({
    accountingPeriod: 'Jun-26',
    burdenedCost: 4188.09,
    documentEntry: 'Benefits Allocation',
    expenditureCategory: '02 - Fringe Benefits',
    expenditureType: '508110 - Employee Benefits Pool',
    transactionNumber: 1017,
  }),
  createProjectCost({
    accountingPeriod: 'Jun-26',
    burdenedCost: -320,
    documentEntry: 'Cost Transfer',
    expenditureCategory: '03 - Supplies / Services / Other Expenses',
    expenditureType: '522810 - Research Materials',
    transactionNumber: 1018,
  }),
  createProjectCost({
    accountingPeriod: 'Jun-26',
    burdenedCost: 1567.44,
    documentEntry: 'Supplier Invoice',
    expenditureCategory: '03 - Supplies / Services / Other Expenses',
    expenditureType: '522850 - Laboratory Support Services',
    transactionNumber: 1019,
  }),
  createProjectCost({
    accountingPeriod: 'Jun-26',
    burdenedCost: 3108.52,
    documentEntry: 'Indirect Cost Allocation',
    expenditureCategory: '09 - Indirect Costs',
    expenditureType: '538100 - Sponsored Program Indirect Costs',
    transactionNumber: 1020,
  }),
];

function setupHandlers(
  projects: ProjectRecord[],
  costs: ProjectCostRecord[] = projectCostRecords
) {
  server.use(
    http.get('/api/user/me', () =>
      HttpResponse.json({
        email: 'pi@example.com',
        employeeId: '1000',
        id: 'user-1',
        kerberos: 'pi',
        name: 'PI User',
        roles: [],
      })
    ),
    http.get('/api/project/managed/by-iam/:iamId', () =>
      HttpResponse.json({ pis: [], projectManager: null })
    ),
    http.get('/api/project/by-iam/:iamId', () => HttpResponse.json(projects)),
    http.get('/api/project/costs/:projectNumber', () =>
      HttpResponse.json(costs)
    )
  );
}

describe('project costs page', () => {
  it('shows the project-costs table for a project', async () => {
    setupHandlers([createProject()]);

    const { cleanup } = renderRoute({
      initialPath: '/projectcosts/1000/P1',
    });

    try {
      expect(
        await screen.findByRole('heading', { name: 'Project Costs' })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { level: 2, name: 'Test Project' })
      ).toBeInTheDocument();
      const table = screen.getByTestId('project-costs-table');
      expect(table).toBeInTheDocument();
      expect(
        within(table)
          .getAllByRole('columnheader')
          .map((header) => header.textContent)
      ).toEqual([
        'Expenditure Category',
        'Accounting Period',
        'Expenditure Item Date',
        'Document Entry',
        'Expenditure Type',
        'Burdened Cost',
      ]);
      expect(screen.getAllByText('09.15.2026')[0]).toBeInTheDocument();
      const payrollEntries = screen.getAllByText('Payroll Distribution');
      expect(payrollEntries).toHaveLength(3);
      expect(payrollEntries[0].closest('tr')).toHaveAttribute(
        'style',
        expect.stringContaining('border-left: 3px solid')
      );
      expect(screen.getByText('Total costs')).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Project Details' })
      ).toHaveAttribute('href', '/projects/1000/P1');
      expect(
        screen.getByRole('link', { name: 'Project Burndown' })
      ).toHaveAttribute('href', '/projectburndown/1000/P1');
      expect(
        screen.getByRole('button', { name: 'Export' })
      ).toBeInTheDocument();
      expect(screen.getByLabelText('From')).toHaveValue('');
      expect(screen.getByLabelText('To')).toHaveValue('');
    } finally {
      cleanup();
    }
  });

  it('does not show the task column or task filter for sponsored projects', async () => {
    setupHandlers([createProject()]);

    const { cleanup } = renderRoute({
      initialPath: '/projectcosts/1000/P1',
    });

    try {
      const table = await screen.findByTestId('project-costs-table');

      expect(
        within(table).queryByRole('columnheader', { name: 'Task' })
      ).not.toBeInTheDocument();
      expect(
        within(table).queryByRole('combobox', { name: 'Task' })
      ).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('shows the task column and filters by task for internal projects', async () => {
    const user = userEvent.setup();
    setupHandlers(
      [createProject({ awardNumber: null, projectType: 'Internal' })],
      [
        createProjectCost({
          documentEntry: 'Field Entry',
          taskName: 'Field Work',
          taskNumber: 'TASK02',
          transactionNumber: 1,
        }),
        createProjectCost({
          documentEntry: 'Lab Entry',
          taskName: 'Lab Work',
          taskNumber: 'TASK01',
          transactionNumber: 2,
        }),
      ]
    );

    const { cleanup } = renderRoute({
      initialPath: '/projectcosts/1000/P1',
    });

    try {
      const table = await screen.findByTestId('project-costs-table');

      expect(
        within(table).getByRole('columnheader', { name: 'Task' })
      ).toBeInTheDocument();
      const taskFilter = within(table).getByRole('combobox', {
        name: 'Task',
      });
      expect(
        within(taskFilter)
          .getAllByRole('option')
          .map((option) => option.textContent)
      ).toEqual(['All Tasks', 'TASK01 - Lab Work', 'TASK02 - Field Work']);
      expect(taskFilter).toHaveValue('');

      await user.selectOptions(taskFilter, 'TASK02');
      expect(screen.getByText('Field Entry')).toBeInTheDocument();
      expect(screen.queryByText('Lab Entry')).not.toBeInTheDocument();

      await user.selectOptions(taskFilter, '');
      expect(screen.getByText('Field Entry')).toBeInTheDocument();
      expect(screen.getByText('Lab Entry')).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('filters by the task in the URL', async () => {
    setupHandlers(
      [createProject({ awardNumber: null, projectType: 'Internal' })],
      [
        createProjectCost({
          documentEntry: 'Field Entry',
          taskName: 'Field Work',
          taskNumber: 'TASK02',
          transactionNumber: 1,
        }),
        createProjectCost({
          documentEntry: 'Lab Entry',
          taskName: 'Lab Work',
          taskNumber: 'TASK01',
          transactionNumber: 2,
        }),
      ]
    );

    const { cleanup } = renderRoute({
      initialPath: '/projectcosts/1000/P1?task=TASK02',
    });

    try {
      const table = await screen.findByTestId('project-costs-table');

      expect(within(table).getByRole('combobox', { name: 'Task' })).toHaveValue(
        'TASK02'
      );
      expect(screen.getByText('Field Entry')).toBeInTheDocument();
      expect(screen.queryByText('Lab Entry')).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('keeps a URL task with no costs selectable', async () => {
    setupHandlers([
      createProject({ awardNumber: null, projectType: 'Internal' }),
    ]);

    const { cleanup } = renderRoute({
      initialPath: '/projectcosts/1000/P1?task=TASK99',
    });

    try {
      const table = await screen.findByTestId('project-costs-table');

      expect(within(table).getByRole('combobox', { name: 'Task' })).toHaveValue(
        'TASK99'
      );
      expect(
        screen.queryByText('Payroll Distribution')
      ).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('does not show costs when the feature is disabled', async () => {
    setupHandlers([createProject()]);
    server.use(
      http.get('/api/system/features', () =>
        HttpResponse.json({
          burndownEnabled: true,
          expenditureProgressEnabled: true,
          projectCostsEnabled: false,
        })
      )
    );

    const { cleanup } = renderRoute({
      initialPath: '/projectcosts/1000/P1',
    });

    try {
      expect(
        await screen.findByText(
          'Project costs are not available in this environment.'
        )
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId('project-costs-table')
      ).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('filters by multiple expenditure categories and resets to all categories', async () => {
    const user = userEvent.setup();
    setupHandlers([createProject()]);

    const { cleanup } = renderRoute({
      initialPath: '/projectcosts/1000/P1',
    });

    try {
      const table = await screen.findByTestId('project-costs-table');
      const travelFilter = within(table).getByRole('button', {
        name: '07 - Travel',
      });
      const indirectCostsFilter = within(table).getByRole('button', {
        name: '09 - Indirect Costs',
      });
      const allCategoriesFilter = within(table).getByRole('button', {
        name: 'All Categories',
      });

      expect(allCategoriesFilter).toHaveAttribute('aria-pressed', 'true');

      await user.click(travelFilter);
      expect(travelFilter).toHaveAttribute('aria-pressed', 'true');
      expect(allCategoriesFilter).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getAllByText('Travel Reimbursement')).toHaveLength(2);
      expect(
        screen.queryByText('Payroll Distribution')
      ).not.toBeInTheDocument();

      await user.click(indirectCostsFilter);
      expect(indirectCostsFilter).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getAllByText('Indirect Cost Allocation')).toHaveLength(3);
      expect(screen.getAllByText('Travel Reimbursement')).toHaveLength(2);

      await user.click(allCategoriesFilter);
      expect(allCategoriesFilter).toHaveAttribute('aria-pressed', 'true');
      expect(travelFilter).toHaveAttribute('aria-pressed', 'false');
      expect(indirectCostsFilter).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getAllByText('Payroll Distribution')).toHaveLength(3);
    } finally {
      cleanup();
    }
  });

  it('filters by the expenditure category in the URL', async () => {
    setupHandlers([createProject()]);

    const { cleanup } = renderRoute({
      initialPath: '/projectcosts/1000/P1?category=07%20-%20Travel',
    });

    try {
      const table = await screen.findByTestId('project-costs-table');
      const travelFilter = within(table).getByRole('button', {
        name: '07 - Travel',
      });

      expect(travelFilter).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getAllByText('Travel Reimbursement')).toHaveLength(2);
      expect(
        screen.queryByText('Payroll Distribution')
      ).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('filters by any expenditure category in the URL, not just the original five', async () => {
    setupHandlers(
      [createProject()],
      [
        ...projectCostRecords,
        createProjectCost({
          accountingPeriod: 'Sep-26',
          burdenedCost: 5000,
          documentEntry: 'Supplier Invoice',
          expenditureCategory: '04 - Equipment and Facilities',
          expenditureType: '540000 - Equipment',
          transactionNumber: 999,
        }),
      ]
    );

    const { cleanup } = renderRoute({
      initialPath:
        '/projectcosts/1000/P1?category=04%20-%20Equipment%20and%20Facilities',
    });

    try {
      const table = await screen.findByTestId('project-costs-table');

      expect(
        within(table).getByRole('button', {
          name: '04 - Equipment and Facilities',
        })
      ).toHaveAttribute('aria-pressed', 'true');
      expect(
        within(table).getByRole('button', { name: 'All Categories' })
      ).toHaveAttribute('aria-pressed', 'false');
      expect(
        screen.queryByText('Payroll Distribution')
      ).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('filters by expenditure item date range and clears it', async () => {
    const user = userEvent.setup();
    setupHandlers(
      [createProject()],
      [
        createProjectCost({
          documentEntry: 'March Entry',
          expenditureItemDate: '2026-03-10T00:00:00',
          transactionNumber: 1,
        }),
        createProjectCost({
          documentEntry: 'June Entry',
          expenditureItemDate: '2026-06-15T00:00:00',
          transactionNumber: 2,
        }),
        createProjectCost({
          documentEntry: 'September Entry',
          expenditureItemDate: '2026-09-20T00:00:00',
          transactionNumber: 3,
        }),
      ]
    );

    const { cleanup } = renderRoute({
      initialPath: '/projectcosts/1000/P1',
    });

    try {
      await screen.findByTestId('project-costs-table');
      expect(screen.getByText('March Entry')).toBeInTheDocument();

      await user.type(screen.getByLabelText('From'), '2026-06-15');
      expect(screen.queryByText('March Entry')).not.toBeInTheDocument();
      expect(screen.getByText('June Entry')).toBeInTheDocument();
      expect(screen.getByText('September Entry')).toBeInTheDocument();

      await user.type(screen.getByLabelText('To'), '2026-06-15');
      expect(screen.getByText('June Entry')).toBeInTheDocument();
      expect(screen.queryByText('September Entry')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Clear dates' }));
      expect(screen.getByText('March Entry')).toBeInTheDocument();
      expect(screen.getByText('September Entry')).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('builds category filters from the categories in the costs', async () => {
    setupHandlers(
      [createProject()],
      [
        createProjectCost({
          accountingPeriod: 'Sep-26',
          burdenedCost: 5000,
          documentEntry: 'Supplier Invoice',
          expenditureCategory: '04 - Equipment and Facilities',
          expenditureType: '540000 - Equipment',
          transactionNumber: 1,
        }),
      ]
    );

    const { cleanup } = renderRoute({
      initialPath: '/projectcosts/1000/P1',
    });

    try {
      const table = await screen.findByTestId('project-costs-table');

      expect(
        within(table).getByRole('button', {
          name: '04 - Equipment and Facilities',
        })
      ).toBeInTheDocument();
      expect(
        within(table).queryByRole('button', { name: '07 - Travel' })
      ).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('pages costs 100 rows at a time and totals every filtered row', async () => {
    setupHandlers(
      [createProject()],
      Array.from({ length: 150 }, (_, index) =>
        createProjectCost({
          accountingPeriod: 'Sep-26',
          burdenedCost: 10,
          documentEntry: `Entry ${index + 1}`,
          expenditureCategory: '03 - Supplies / Services / Other Expenses',
          expenditureType: '522810 - Research Materials',
          transactionNumber: index + 1,
        })
      )
    );

    const { cleanup } = renderRoute({
      initialPath: '/projectcosts/1000/P1',
    });

    try {
      await screen.findByTestId('project-costs-table');

      expect(screen.getByText('Entry 100')).toBeInTheDocument();
      expect(screen.queryByText('Entry 101')).not.toBeInTheDocument();
      expect(screen.getByText('$1,500.00')).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('exports every report column, not just the visible ones', async () => {
    const user = userEvent.setup();
    setupHandlers(
      [createProject()],
      [
        createProjectCost({
          accountingDate: '2026-09-30T00:00:00',
          burdenedCost: 1250.5,
          comment: 'Field sampling kits',
          expenditureBatch: 'AP-BATCH-77',
          expenditureItemDate: '2026-09-12T00:00:00',
          rawCost: 1000,
          taskName: 'Field Work',
          transactionNumber: 4242,
        }),
      ]
    );

    const { cleanup } = renderRoute({
      initialPath: '/projectcosts/1000/P1',
    });

    try {
      await screen.findByTestId('project-costs-table');
      await user.click(screen.getByRole('button', { name: 'Export' }));

      expect(downloadExcelCsv).toHaveBeenCalledTimes(1);
      const [csv, filename] = vi.mocked(downloadExcelCsv).mock.calls[0] ?? [];
      const [headerLine, dataLine] = String(csv)
        .replace(/^\ufeff/, '')
        .split('\r\n');

      expect(filename).toBe('project-costs.csv');
      expect(headerLine.split(',')).toHaveLength(47);
      expect(headerLine).toContain('Expenditure Item Date');
      expect(headerLine).toContain('Accounting Date');
      expect(headerLine).toContain('Raw Cost');
      expect(headerLine).toContain('Task Name');
      expect(dataLine).toContain('4242');
      expect(dataLine).toContain('09/12/2026');
      expect(dataLine).toContain('09/30/2026');
      expect(dataLine).toContain('AP-BATCH-77');
      expect(dataLine).toContain('Field sampling kits');
      expect(dataLine).toContain('Field Work');
      expect(dataLine).toContain('"1,000.00","1,250.50"');
    } finally {
      cleanup();
    }
  });
});
