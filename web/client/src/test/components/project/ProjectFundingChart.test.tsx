import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ProjectFundingChart } from '@/components/project/ProjectFundingChart.tsx';
import type { ProjectRecord } from '@/queries/project.ts';

// Recharts uses ResizeObserver internally
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

afterEach(cleanup);

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
  balance: 5000,
  billingCycle: null,
  budget: 10_000,
  commitments: 1000,
  contractAdministrator: null,
  copi: null,
  costShareRequiredBySponsor: null,
  displayName: 'P1: Test Project',
  expenditureCategoryName: null,
  expenses: 4000,
  flowThroughFundsAmount: null,
  flowThroughFundsEndDate: null,
  flowThroughFundsPrimarySponsor: null,
  flowThroughFundsReferenceAwardName: null,
  flowThroughFundsStartDate: null,
  fundCode: 'FUND1',
  fundDesc: 'Federal',
  grantAdministrator: null,
  pa: null,
  pi: 'PI Name',
  pm: null,
  pmEmployeeId: null,
  postReportingPeriod: null,
  ppmBudBal: 5000,
  ppmBudget: 10_000,
  ppmCommitments: 1000,
  ppmExpenses: 4000,
  primarySponsorName: null,
  programCode: 'PROG1',
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

describe('ProjectFundingChart', () => {
  it('renders positive funding types in the chart labels', () => {
    render(
      <ProjectFundingChart
        projects={[
          createProject({ balance: 8000, projectType: 'Internal' }),
          createProject({ balance: 2000, projectType: 'Sponsored' }),
        ]}
      />
    );

    expect(screen.getByText('Internal')).toBeInTheDocument();
    expect(screen.getByText('Sponsored')).toBeInTheDocument();
  });

  it('hides types with negative aggregate balance from the chart', () => {
    render(
      <ProjectFundingChart
        projects={[
          createProject({ balance: 10_000, projectType: 'Sponsored' }),
          createProject({ balance: -3000, projectType: 'Internal' }),
        ]}
      />
    );

    // Sponsored should be in the legend
    expect(screen.getByText('Sponsored')).toBeInTheDocument();

    // Internal should only appear in the negative section, not the legend
    expect(screen.getByText('Negative balances (not shown above):')).toBeInTheDocument();
    expect(screen.getByText(/Internal:.*-\$3,000/)).toBeInTheDocument();
  });

  it('clamps per-type, not per-project', () => {
    // Two Internal projects: +8000 and -3000 = net +5000 (positive, should show)
    render(
      <ProjectFundingChart
        projects={[
          createProject({ balance: 8000, projectType: 'Internal' }),
          createProject({ balance: -3000, projectType: 'Internal' }),
          createProject({ balance: 5000, projectType: 'Sponsored' }),
        ]}
      />
    );

    expect(screen.getByText('Internal')).toBeInTheDocument();
    expect(screen.getByText('Sponsored')).toBeInTheDocument();
    expect(
      screen.queryByText('Negative balances (not shown above):')
    ).not.toBeInTheDocument();
  });

  it('shows only the negative section when all types are negative', () => {
    render(
      <ProjectFundingChart
        projects={[
          createProject({ balance: -1000, projectType: 'Internal' }),
          createProject({ balance: -2000, projectType: 'Sponsored' }),
        ]}
      />
    );

    // No legend items for the chart
    expect(screen.queryByText(/\$.*\(\d+%\)/)).not.toBeInTheDocument();

    // Negative section present
    expect(screen.getByText('Negative balances (not shown above):')).toBeInTheDocument();
    expect(screen.getByText(/Internal:.*-\$1,000/)).toBeInTheDocument();
    expect(screen.getByText(/Sponsored:.*-\$2,000/)).toBeInTheDocument();
  });

  it('does not show the negative section when all types are positive', () => {
    render(
      <ProjectFundingChart
        projects={[
          createProject({ balance: 5000, projectType: 'Internal' }),
          createProject({ balance: 5000, projectType: 'Sponsored' }),
        ]}
      />
    );

    expect(
      screen.queryByText('Negative balances (not shown above):')
    ).not.toBeInTheDocument();
  });

  it('excludes zero-balance types from both chart and negative section', () => {
    render(
      <ProjectFundingChart
        projects={[
          createProject({ balance: 5000, projectType: 'Sponsored' }),
          createProject({ balance: 0, projectType: 'Internal' }),
        ]}
      />
    );

    expect(screen.getByText('Sponsored')).toBeInTheDocument();
    // Zero-balance Internal should not appear in legend or negative section
    expect(
      screen.queryByText('Negative balances (not shown above):')
    ).not.toBeInTheDocument();
  });
});
