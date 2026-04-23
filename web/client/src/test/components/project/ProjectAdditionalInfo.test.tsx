import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ProjectAdditionalInfo } from '@/components/project/ProjectAdditionalInfo.tsx';
import { tooltipDefinitions } from '@/shared/tooltips.ts';
import type { ProjectSummary } from '@/lib/projectSummary.ts';

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

describe('ProjectAdditionalInfo', () => {
  it('renders the section heading', () => {
    render(<ProjectAdditionalInfo summary={createSummary()} />);

    expect(screen.getByText('Award Information')).toBeInTheDocument();
  });

  it('shows primary award fields for all users', () => {
    render(<ProjectAdditionalInfo summary={createSummary()} />);

    expect(screen.getByText('Award Number')).toBeInTheDocument();
    expect(screen.getByText('AWD-100')).toBeInTheDocument();
    expect(screen.getByText('Award Name')).toBeInTheDocument();
    expect(screen.getByText('Test Award')).toBeInTheDocument();
    expect(screen.getByText('Award PI')).toBeInTheDocument();
    expect(screen.getByText('Smith, Jane')).toBeInTheDocument();
    expect(screen.getByText('Award End Date')).toBeInTheDocument();
    expect(screen.getByText('Primary Sponsor Name')).toBeInTheDocument();
    expect(screen.getByText('National Science Foundation')).toBeInTheDocument();
    expect(screen.getByText('Sponsor Award Number')).toBeInTheDocument();
    expect(screen.getByText('NSF-2024-001')).toBeInTheDocument();
    expect(screen.getByText('Indirect/Burden Rate')).toBeInTheDocument();
    expect(screen.getByText('26.5%')).toBeInTheDocument();
  });

  it('hides secondary fields by default', () => {
    render(<ProjectAdditionalInfo summary={createSummary()} />);

    expect(screen.queryByText('Award Close Date')).not.toBeInTheDocument();
    expect(screen.queryByText('Billing Cycle')).not.toBeInTheDocument();
  });

  it('shows Show more button for all users', () => {
    render(<ProjectAdditionalInfo summary={createSummary()} />);

    expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument();
  });

  it('reveals hidden fields when Show more is clicked', async () => {
    const user = userEvent.setup();
    render(<ProjectAdditionalInfo summary={createSummary()} />);

    await user.click(screen.getByRole('button', { name: 'Show more' }));

    expect(screen.getByText('Award Close Date')).toBeInTheDocument();
    expect(screen.getByText('Contract Administrator')).toBeInTheDocument();
    expect(screen.getByText('Admin, Carol')).toBeInTheDocument();
    expect(screen.getByText('Billing Cycle')).toBeInTheDocument();
    expect(screen.getByText('Monthly')).toBeInTheDocument();
    expect(screen.getByText('Burden Structure')).toBeInTheDocument();
    expect(screen.getByText('MTDC')).toBeInTheDocument();
  });

  it('collapses fields when Show less is clicked', async () => {
    const user = userEvent.setup();
    render(<ProjectAdditionalInfo summary={createSummary()} />);

    await user.click(screen.getByRole('button', { name: 'Show more' }));
    expect(screen.getByText('Billing Cycle')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show less' }));
    expect(screen.queryByText('Billing Cycle')).not.toBeInTheDocument();
  });

  it('displays em-dash for null values', () => {
    render(
      <ProjectAdditionalInfo
        summary={createSummary({
          awardName: null,
          awardPi: null,
        })}
      />
    );

    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('formats dates as MM.dd.yyyy', () => {
    render(
      <ProjectAdditionalInfo
        summary={createSummary({
          awardEndDate: '2026-12-31',
          awardStartDate: '2024-01-01',
        })}
      />
    );

    expect(screen.getByText('12.31.2026')).toBeInTheDocument();
    expect(screen.getByText('01.01.2024')).toBeInTheDocument();
  });

  it('shows a tooltip for Indirect/Burden Rate', async () => {
    const user = userEvent.setup();
    render(<ProjectAdditionalInfo summary={createSummary()} />);

    const label = screen.getByText('Indirect/Burden Rate');
    await user.hover(label.parentElement as HTMLElement);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      tooltipDefinitions.burdenScheduleRate
    );
  });

  it('shows tooltips for secondary award fields after expansion', async () => {
    const user = userEvent.setup();
    render(<ProjectAdditionalInfo summary={createSummary()} />);

    await user.click(screen.getByRole('button', { name: 'Show more' }));

    const label = screen.getByText('Billing Cycle');
    await user.hover(label.parentElement as HTMLElement);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      tooltipDefinitions.billingCycle
    );
  });

  it('hides the Flow-Through Funds subsection when the primary sponsor is null', async () => {
    const user = userEvent.setup();
    render(
      <ProjectAdditionalInfo
        summary={createSummary({
          flowThroughFundsPrimarySponsor: null,
          flowThroughFundsReferenceAwardName: 'Parent Award XYZ',
          flowThroughFundsAmount: '500000',
        })}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Show more' }));

    expect(screen.queryByText('Flow-Through Funds')).not.toBeInTheDocument();
    expect(screen.queryByText('Parent Award XYZ')).not.toBeInTheDocument();
  });

  it('hides the Flow-Through Funds subsection until Show more is clicked', () => {
    render(
      <ProjectAdditionalInfo
        summary={createSummary({
          flowThroughFundsPrimarySponsor: 'Harvard University',
        })}
      />
    );

    expect(screen.queryByText('Flow-Through Funds')).not.toBeInTheDocument();
  });

  it('renders the Flow-Through Funds subsection after Show more when populated', async () => {
    const user = userEvent.setup();
    render(
      <ProjectAdditionalInfo
        summary={createSummary({
          flowThroughFundsPrimarySponsor: 'Harvard University',
          flowThroughFundsReferenceAwardName: 'H-2024-001',
          flowThroughFundsStartDate: '2024-07-01',
          flowThroughFundsEndDate: '2027-06-30',
          flowThroughFundsAmount: '1234567',
        })}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Show more' }));

    expect(screen.getByText('Flow-Through Funds')).toBeInTheDocument();
    expect(screen.getByText('Harvard University')).toBeInTheDocument();
    expect(screen.getByText('H-2024-001')).toBeInTheDocument();
    expect(screen.getByText('07.01.2024')).toBeInTheDocument();
    expect(screen.getByText('06.30.2027')).toBeInTheDocument();
    expect(screen.getByText('$1,234,567.00')).toBeInTheDocument();
  });

  it('shows em-dash for individual null flow-through fields when subsection is rendered', async () => {
    const user = userEvent.setup();
    render(
      <ProjectAdditionalInfo
        summary={createSummary({
          flowThroughFundsPrimarySponsor: 'Harvard University',
          flowThroughFundsReferenceAwardName: null,
          flowThroughFundsStartDate: null,
          flowThroughFundsEndDate: null,
          flowThroughFundsAmount: null,
        })}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Show more' }));

    expect(screen.getByText('Flow-Through Funds')).toBeInTheDocument();
    expect(screen.getByText('Reference Award Name')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();
  });

  it('renders nothing when awardNumber is null (internal project)', () => {
    const { container } = render(
      <ProjectAdditionalInfo summary={createSummary({ awardNumber: null })} />
    );

    expect(container.innerHTML).toBe('');
    expect(screen.queryByText('Award Information')).not.toBeInTheDocument();
  });
});
