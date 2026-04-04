import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
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
  it('opens the Commitment drawer on click', async () => {
    const user = userEvent.setup();
    render(<FinancialDetails summary={createSummary()} />);

    const commitmentTrigger = screen.getByRole('button', {
      name: 'Commitment',
    });
    const commitmentLabel = within(commitmentTrigger).getByText('Commitment');

    expect(commitmentLabel).toBeInTheDocument();
    expect(commitmentTrigger).toHaveAttribute('data-tooltip-placement', 'top');
    expect(commitmentTrigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(commitmentLabel).toHaveClass('tooltip-label');

    await user.click(commitmentTrigger);

    expect(await screen.findByRole('dialog', { name: 'Commitment' })).toHaveTextContent(
      tooltipDefinitions.commitment
    );
  });

  it('closes the drawer when the backdrop is clicked', async () => {
    const user = userEvent.setup();
    render(<FinancialDetails summary={createSummary()} />);

    await user.click(screen.getByRole('button', { name: 'Commitment' }));
    expect(
      await screen.findByRole('dialog', { name: 'Commitment' })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dismiss Commitment help' }));

    expect(
      screen.queryByRole('dialog', { name: 'Commitment' })
    ).not.toBeInTheDocument();
  });

  it('opens the Balance drawer on click', async () => {
    const user = userEvent.setup();
    render(<FinancialDetails summary={createSummary()} />);

    const balanceTrigger = screen.getByRole('button', { name: 'Balance' });
    const balanceLabel = within(balanceTrigger).getByText('Balance');

    expect(balanceLabel).toBeInTheDocument();
    expect(balanceTrigger).toHaveAttribute('data-tooltip-placement', 'top');
    expect(balanceTrigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(balanceLabel).toHaveClass('tooltip-label');

    await user.click(balanceTrigger);

    expect(await screen.findByRole('dialog', { name: 'Balance' })).toHaveTextContent(
      tooltipDefinitions.balance
    );
  });
});
