import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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

describe('ProjectDetails Finjector link', () => {
  it('links the project number to Finjector for sponsored projects', () => {
    render(
      <ProjectDetails
        summary={createSummary({
          isInternal: false,
          projectNumber: 'K30BND3F03',
          projectOwningOrgCode: 'AENM002',
          taskNum: 'RATEEX',
        })}
      />
    );

    const link = screen.getByRole('link', { name: /K30BND3F03/ });
    expect(link).toHaveAttribute(
      'href',
      'https://finjector.ucdavis.edu/details/K30BND3F03-RATEEX-AENM002-522201/'
    );
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('does not link the project number for internal projects', () => {
    render(
      <ProjectDetails
        summary={createSummary({
          isInternal: true,
          projectNumber: 'FPAENM2341',
          projectOwningOrgCode: 'AENM002',
          taskNum: 'BIOIDV',
        })}
      />
    );

    expect(
      screen.queryByRole('link', { name: /FPAENM2341/ })
    ).not.toBeInTheDocument();
    expect(screen.getByText('FPAENM2341')).toBeInTheDocument();
  });
});

describe('ProjectDetails', () => {
  it('shows project dates as a timeline', () => {
    render(<ProjectDetails summary={createSummary()} />);

    expect(screen.getByText('Timeline')).toBeInTheDocument();
    expect(screen.getByText('01.01.2024 - 12.31.2026')).toBeInTheDocument();
    expect(screen.queryByText('Project Start')).not.toBeInTheDocument();
    expect(screen.queryByText('Project End')).not.toBeInTheDocument();
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
