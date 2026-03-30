import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { FinancialDetails } from '@/components/project/FinancialDetails.tsx';
import type { ProjectSummary } from '@/lib/projectSummary.ts';
import { tooltipDefinitions } from '@/shared/tooltips.ts';

afterEach(cleanup);

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
  grantAdministrator: null,
  internalFundedProject: null,
  isInternal: false,
  pa: null,
  pi: 'PI Name',
  pm: null,
  pmEmployeeId: null,
  postReportingPeriod: null,
  primarySponsorName: 'National Science Foundation',
  projectBurdenCostRate: '0.265',
  projectBurdenScheduleBase: 'MTDC-Rev 001',
  projectFund: null,
  projectNumber: 'K30ABC123',
  projectStatusCode: 'ACTIVE',
  sponsorAwardNumber: 'NSF-2024-001',
  totals: { balance: 4000, budget: 10_000, encumbrance: 1000, expense: 5000 },
  ...overrides,
});

describe('FinancialDetails', () => {
  it('shows the Commitment tooltip on hover', async () => {
    const user = userEvent.setup();
    render(<FinancialDetails summary={createSummary()} />);

    const commitmentLabel = screen.getByText('Commitment');
    const commitmentTrigger = commitmentLabel.parentElement as HTMLElement;

    expect(commitmentLabel).toBeInTheDocument();
    expect(commitmentTrigger).toHaveAttribute('data-tooltip-placement', 'top');
    expect(commitmentTrigger).toHaveAttribute('tabIndex', '0');
    expect(commitmentLabel).toHaveClass('tooltip-label');

    await user.hover(commitmentTrigger);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      tooltipDefinitions.commitment
    );
  });

  it('shows the Balance tooltip on hover', async () => {
    const user = userEvent.setup();
    render(<FinancialDetails summary={createSummary()} />);

    const balanceLabel = screen.getByText('Balance');
    const balanceTrigger = balanceLabel.parentElement as HTMLElement;

    expect(balanceLabel).toBeInTheDocument();
    expect(balanceTrigger).toHaveAttribute('data-tooltip-placement', 'top');
    expect(balanceTrigger).toHaveAttribute('tabIndex', '0');
    expect(balanceLabel).toHaveClass('tooltip-label');

    await user.hover(balanceTrigger);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      tooltipDefinitions.balance
    );
  });
});
