import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ProjectDetails } from '@/components/project/ProjectDetails.tsx';
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
  pm: 'PM Name',
  pmEmployeeId: '1000',
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

describe('ProjectDetails', () => {
  it('opens a drawer for Balance in the main summary card', async () => {
    const user = userEvent.setup();
    render(<ProjectDetails summary={createSummary()} />);

    const balanceTrigger = screen.getByRole('button', { name: 'Balance' });
    const balanceLabel = within(balanceTrigger).getByText('Balance');

    expect(balanceTrigger).toHaveAttribute('data-tooltip-placement', 'top');
    expect(balanceTrigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(balanceLabel).toHaveClass('tooltip-label');

    await user.click(balanceTrigger);

    expect(await screen.findByRole('dialog', { name: 'Balance' })).toHaveTextContent(
      tooltipDefinitions.balance
    );
  });
});
