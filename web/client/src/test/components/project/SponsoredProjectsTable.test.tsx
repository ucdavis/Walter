import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SponsoredProjectsTable } from '@/components/project/SponsoredProjectsTable.tsx';
import { downloadExcelCsv } from '@/lib/csv.ts';
import type { ProjectRecord } from '@/queries/project.ts';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

vi.mock('@/lib/csv.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/csv.ts')>();

  return {
    ...actual,
    downloadExcelCsv: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
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
  awardStatus: 'Active',
  awardType: 'Grant',
  balance: 4000,
  billingCycle: null,
  budget: 10000,
  commitments: 1000,
  expenses: 5000,
  ppmBudBal: 4000,
  ppmBudget: 10000,
  ppmCommitments: 1000,
  ppmExpenses: 5000,
  contractAdministrator: null,
  copi: null,
  costShareRequiredBySponsor: null,
  displayName: 'P1: Sunny Project',
  expenditureCategoryName: null,
  flowThroughFundsAmount: null,
  flowThroughFundsEndDate: null,
  flowThroughFundsPrimarySponsor: null,
  flowThroughFundsReferenceAwardName: null,
  flowThroughFundsStartDate: null,
  fundCode: null,
  fundDesc: 'Federal',
  grantAdministrator: null,
  pa: null,
  pi: 'PI Name',
  pm: 'PM Name',
  pmEmployeeId: null,
  postReportingPeriod: null,
  primarySponsorName: 'NSF',
  programCode: null,
  programDesc: 'Program',
  projectBurdenCostRate: null,
  projectBurdenScheduleBase: null,
  projectFund: null,
  projectName: 'Sunny Project',
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

describe('SponsoredProjectsTable', () => {
  it('shows the filtered export action only when a search filter is active', () => {
    const projects = [
      createProject(),
      createProject({
        awardNumber: 'AWD002',
        displayName: 'P2: Rainy Project',
        projectName: 'Rainy Project',
        projectNumber: 'P2',
      }),
    ];

    render(<SponsoredProjectsTable employeeId="123" records={projects} />);

    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Export filtered' })
    ).not.toBeInTheDocument();

    fireEvent.input(screen.getByPlaceholderText('Search all columns...'), {
      target: { value: 'Sunny' },
    });

    expect(
      screen.getByRole('button', { name: 'Export filtered' })
    ).toBeInTheDocument();
  });

  it('exports only filtered sponsored projects when the filtered export button is used', () => {
    const projects = [
      createProject(),
      createProject({
        awardNumber: 'AWD002',
        displayName: 'P2: Rainy Project',
        projectName: 'Rainy Project',
        projectNumber: 'P2',
      }),
    ];

    render(<SponsoredProjectsTable employeeId="123" records={projects} />);

    fireEvent.input(screen.getByPlaceholderText('Search all columns...'), {
      target: { value: 'Sunny' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Export filtered' }));

    expect(downloadExcelCsv).toHaveBeenCalledTimes(1);

    const csv = vi.mocked(downloadExcelCsv).mock.calls[0]?.[0];
    const filename = vi.mocked(downloadExcelCsv).mock.calls[0]?.[1];

    expect(csv).toContain('Sunny Project');
    expect(csv).not.toContain('Rainy Project');
    expect(csv).toContain('01/01/2024');
    expect(filename).toBe('projects-filtered.csv');
  });

  it('filters rows by project number', () => {
    const projects = [
      createProject({
        displayName: 'Sunny Project',
        projectName: 'Sunny Project',
        projectNumber: 'KAOSUN001',
      }),
      createProject({
        awardNumber: 'AWD002',
        displayName: 'Rainy Project',
        projectName: 'Rainy Project',
        projectNumber: 'KAORAI002',
      }),
    ];

    render(<SponsoredProjectsTable employeeId="123" records={projects} />);

    expect(screen.getByText('Sunny Project')).toBeInTheDocument();
    expect(screen.getByText('Rainy Project')).toBeInTheDocument();

    fireEvent.input(screen.getByPlaceholderText('Search all columns...'), {
      target: { value: 'KAOSUN' },
    });

    expect(screen.getByText('Sunny Project')).toBeInTheDocument();
    expect(screen.queryByText('Rainy Project')).not.toBeInTheDocument();
  });
});
