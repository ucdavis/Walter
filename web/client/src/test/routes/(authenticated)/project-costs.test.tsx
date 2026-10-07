import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { ProjectRecord } from '@/queries/project.ts';
import { server } from '@/test/mswUtils.ts';
import { renderRoute } from '@/test/routerUtils.tsx';

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
  projectFund: null,
  projectName: 'Test Project',
  projectNumber: 'P1',
  projectOwningOrg: 'ORG001',
  projectOwningOrgCode: 'ORG001',
  projectStatusCode: 'ACTIVE',
  projectType: 'Sponsored',
  purposeDesc: 'Research',
  sponsorAwardNumber: null,
  taskName: 'Task 1',
  taskNum: 'T001',
  taskStatus: 'Active',
  ...overrides,
});

function setupHandlers(projects: ProjectRecord[]) {
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
    http.get('/api/project/by-iam/:iamId', () => HttpResponse.json(projects))
  );
}

describe('project costs page', () => {
  it('shows a sample project-costs table for a project', async () => {
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
        'Document Entry',
        'Expenditure Type',
        'Burdened Cost',
      ]);
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
      expect(
        screen.getByRole('button', { name: 'Entire project' })
      ).toHaveAttribute('aria-pressed', 'true');
    } finally {
      cleanup();
    }
  });

  it('does not show sample costs when the feature is disabled', async () => {
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

  it('filters by multiple expenditure categories and clears the selection', async () => {
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
      const clearFilter = within(table).getByRole('button', { name: 'Clear' });

      expect(clearFilter).toBeDisabled();

      await user.click(travelFilter);
      expect(travelFilter).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getAllByText('Travel Reimbursement')).toHaveLength(2);
      expect(
        screen.queryByText('Payroll Distribution')
      ).not.toBeInTheDocument();

      await user.click(indirectCostsFilter);
      expect(indirectCostsFilter).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getAllByText('Indirect Cost Allocation')).toHaveLength(3);
      expect(screen.getAllByText('Travel Reimbursement')).toHaveLength(2);

      await user.click(clearFilter);
      expect(clearFilter).toBeDisabled();
      expect(travelFilter).toHaveAttribute('aria-pressed', 'false');
      expect(indirectCostsFilter).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getAllByText('Payroll Distribution')).toHaveLength(3);
    } finally {
      cleanup();
    }
  });

  it('filters to the selected trailing timeline', async () => {
    const user = userEvent.setup();
    setupHandlers([createProject()]);

    const { cleanup } = renderRoute({
      initialPath: '/projectcosts/1000/P1',
    });

    try {
      await screen.findByTestId('project-costs-table');
      expect(screen.getByText('Prior Period Allocation')).toBeInTheDocument();

      const threeMonths = screen.getByRole('button', { name: '3mo' });
      await user.click(threeMonths);
      expect(threeMonths).toHaveAttribute('aria-pressed', 'true');
      expect(
        screen.queryByText('Prior Period Allocation')
      ).not.toBeInTheDocument();
      expect(screen.getAllByText('Payroll Distribution')).toHaveLength(3);
      expect(screen.getAllByText('Benefits Allocation')).toHaveLength(3);

      const sixMonths = screen.getByRole('button', { name: '6mo' });
      await user.click(sixMonths);
      expect(sixMonths).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getAllByText('Benefits Allocation')).toHaveLength(4);

      const nineMonths = screen.getByRole('button', { name: '9mo' });
      await user.click(nineMonths);
      expect(nineMonths).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByText('Prior Period Allocation')).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });
});
