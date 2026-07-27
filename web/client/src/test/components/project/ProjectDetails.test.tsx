import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ProjectDetails } from '@/components/project/ProjectDetails.tsx';
import type { ProjectSummary } from '@/lib/projectSummary.ts';
import { tooltipDefinitions } from '@/shared/tooltips.ts';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const createSummary = (
  overrides: Partial<ProjectSummary> = {}
): ProjectSummary => ({
  awardCloseDate: '2026-06-30',
  awardEndDate: '2026-12-31',
  awardName: 'Test Award',
  awardNumber: 'AWD-100',
  awardPi: 'Smith, Jane',
  awardStartDate: '2024-01-01',
  awardStatus: 'Active',
  awardType: 'Federal Grant',
  billingCycle: 'Monthly',
  contractAdministrator: 'Admin, Carol',
  copi: null,
  costShareRequiredBySponsor: null,
  displayName: 'Test Project',
  flowThroughFundsAmount: null,
  flowThroughFundsEndDate: null,
  flowThroughFundsPrimarySponsor: null,
  flowThroughFundsReferenceAwardName: null,
  flowThroughFundsStartDate: null,
  grantAdministrator: null,
  internalFundedProject: null,
  isInternal: false,
  pa: null,
  pi: 'PI Name',
  pm: 'PM Name',
  pmEmployeeId: '1000',
  postReportingPeriod: null,
  primarySponsorName: 'National Science Foundation',
  projectBurdenCostRate: '0.265',
  projectBurdenScheduleBase: 'MTDC-Rev 001',
  projectFund: null,
  projectNumber: 'K30ABC123',
  projectOwningOrgCode: null,
  projectStatusCode: 'ACTIVE',
  sponsorAwardNumber: 'NSF-2024-001',
  taskNum: null,
  totals: { balance: 4000, budget: 10_000, encumbrance: 1000, expense: 5000 },
  ...overrides,
});

describe('ProjectDetails', () => {
  it('leaves project identity and status out of the summary card', () => {
    render(<ProjectDetails summary={createSummary()} />);

    expect(screen.queryByText('Project Number')).not.toBeInTheDocument();
    expect(screen.queryByText('Status')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /K30ABC123/ })
    ).not.toBeInTheDocument();
  });

  it('shows financial values, all-expense progress, and project timeline details', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 15));

    render(<ProjectDetails summary={createSummary()} />);

    expect(screen.getByText('Balance')).toBeInTheDocument();
    expect(screen.getByText('Budget')).toBeInTheDocument();
    expect(screen.getByText('Expense')).toBeInTheDocument();
    expect(screen.getByText('Commitment')).toBeInTheDocument();
    expect(screen.getByText('$4,000.00').closest('dd')).toHaveClass(
      'text-info'
    );
    expect(screen.getAllByText('$10,000.00')[0]).toBeInTheDocument();
    expect(screen.getByText('$5,000.00')).toBeInTheDocument();
    expect(screen.getByText('$1,000.00')).toBeInTheDocument();
    const progressBar = screen.getByRole('img', {
      name: /All Expenses: \$5,000\.00 \(50%\) spent, \$1,000\.00 \(10%\) committed, \$4,000\.00 \(40%\), \$10,000\.00 budget/,
    });
    expect(progressBar).toBeInTheDocument();
    expect(progressBar.firstElementChild).toHaveStyle({
      backgroundColor: 'var(--color-info)',
    });
    expect(screen.queryByText('All Expenses')).not.toBeInTheDocument();
    expect(screen.getByText('Project Start')).toBeInTheDocument();
    expect(screen.getByText('Project End')).toBeInTheDocument();
    expect(screen.getByText('01.01.2024')).toBeInTheDocument();
    expect(screen.getByText('12.31.2026')).toBeInTheDocument();
    expect(
      screen.queryByRole('img', {
        name: /Time: 12 \(33%\) months completed, 24 \(67%\) months remaining/,
      })
    ).not.toBeInTheDocument();
  });

  it('uses internal color for internal project balances and progress bars', () => {
    render(<ProjectDetails summary={createSummary({ isInternal: true })} />);

    expect(screen.getByText('$4,000.00').closest('dd')).toHaveClass(
      'text-accent'
    );

    const progressBar = screen.getByRole('img', {
      name: /All Expenses:/,
    });
    expect(progressBar.firstElementChild).toHaveStyle({
      backgroundColor: 'var(--color-accent)',
    });
  });

  it('keeps negative balance values red', () => {
    render(
      <ProjectDetails
        summary={createSummary({
          totals: {
            balance: -500,
            budget: 10_000,
            encumbrance: 1000,
            expense: 9500,
          },
        })}
      />
    );

    expect(screen.getByText('-$500.00').closest('dd')).toHaveClass(
      'text-error'
    );
  });

  it('shows a tooltip for Balance in the main summary card', async () => {
    const user = userEvent.setup();
    render(<ProjectDetails summary={createSummary()} />);

    const balanceLabel = screen.getByText('Balance');
    const balanceTrigger = balanceLabel.parentElement as HTMLElement;

    expect(balanceTrigger).toHaveAttribute('data-tooltip-placement', 'top');
    expect(balanceTrigger).toHaveAttribute('tabIndex', '0');
    expect(balanceLabel).toHaveClass('tooltip-label');

    await user.hover(balanceTrigger);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      tooltipDefinitions.balance
    );
  });
});
