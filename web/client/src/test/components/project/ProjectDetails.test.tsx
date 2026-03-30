import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
  it('renders a tooltip label for Balance in the main summary card', () => {
    render(<ProjectDetails summary={createSummary()} />);

    const balanceLabel = screen.getAllByText('Balance')[0];
    const balanceTooltip = balanceLabel.parentElement;

    expect(balanceTooltip).toHaveAttribute('data-tip', tooltipDefinitions.balance);
    expect(balanceTooltip).toHaveAttribute('tabIndex', '0');
    expect(balanceTooltip).toHaveClass(
      'tooltip',
      'tooltip-top',
      'inline-block',
      'tooltip-trigger'
    );
    expect(balanceLabel).toHaveClass('tooltip-label');
  });
});
