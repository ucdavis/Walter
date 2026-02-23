import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ProjectAdditionalInfo } from '@/components/project/ProjectAdditionalInfo.tsx';
import type { ProjectSummary } from '@/lib/projectSummary.ts';

afterEach(cleanup);

const createSummary = (
  overrides: Partial<ProjectSummary> = {}
): ProjectSummary => ({
  awardCloseDate: '2026-06-30',
  awardEndDate: '2026-12-31',
  awardNumber: 'AWD-100',
  awardPi: 'Smith, Jane',
  awardStartDate: '2024-01-01',
  awardStatus: 'Active',
  awardType: 'Federal Grant',
  billingCycle: 'Monthly',
  categories: [],
  contractAdministrator: null,
  copi: null,
  costShareRequiredBySponsor: null,
  displayName: 'Test Project',
  grantAdministrator: null,
  internalFundedProject: null,
  isInternal: false,
  pa: null,
  pi: 'PI Name',
  pm: null,
  postReportingPeriod: null,
  primarySponsorName: 'National Science Foundation',
  projectBurdenCostRate: '26.5%',
  projectBurdenScheduleBase: 'MTDC',
  projectFund: null,
  projectNumber: 'K30ABC123',
  projectStatusCode: 'ACTIVE',
  sponsorAwardNumber: 'NSF-2024-001',
  totals: { balance: 4000, budget: 10000, encumbrance: 1000, expense: 5000 },
  ...overrides,
});

describe('ProjectAdditionalInfo', () => {
  it('renders the section heading', () => {
    render(<ProjectAdditionalInfo summary={createSummary()} />);

    expect(screen.getByText('Additional Information')).toBeInTheDocument();
  });

  it('shows visible fields up through Billing Cycle', () => {
    render(<ProjectAdditionalInfo summary={createSummary()} />);

    // These should be visible without expanding
    expect(screen.getByText('Award Close Date')).toBeInTheDocument();
    expect(screen.getByText('Award Number')).toBeInTheDocument();
    expect(screen.getByText('AWD-100')).toBeInTheDocument();
    expect(screen.getByText('Award PI')).toBeInTheDocument();
    expect(screen.getByText('Smith, Jane')).toBeInTheDocument();
    expect(screen.getByText('Award Status')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Award Type')).toBeInTheDocument();
    expect(screen.getByText('Federal Grant')).toBeInTheDocument();
    expect(screen.getByText('Billing Cycle')).toBeInTheDocument();
    expect(screen.getByText('Monthly')).toBeInTheDocument();
  });

  it('hides fields after Billing Cycle until expanded', () => {
    render(<ProjectAdditionalInfo summary={createSummary()} />);

    // These should be hidden initially
    expect(screen.queryByText('Primary Sponsor Name')).not.toBeInTheDocument();
    expect(
      screen.queryByText('National Science Foundation')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Sponsor Award Number')).not.toBeInTheDocument();
    expect(screen.queryByText('Burden Schedule Rate')).not.toBeInTheDocument();
  });

  it('reveals hidden fields when Show more is clicked', async () => {
    const user = userEvent.setup();
    render(<ProjectAdditionalInfo summary={createSummary()} />);

    await user.click(screen.getByRole('button', { name: 'Show more' }));

    expect(screen.getByText('Primary Sponsor Name')).toBeInTheDocument();
    expect(
      screen.getByText('National Science Foundation')
    ).toBeInTheDocument();
    expect(screen.getByText('Sponsor Award Number')).toBeInTheDocument();
    expect(screen.getByText('NSF-2024-001')).toBeInTheDocument();
    expect(screen.getByText('Burden Schedule Rate')).toBeInTheDocument();
    expect(screen.getByText('26.5%')).toBeInTheDocument();
    expect(screen.getByText('Burden Structure')).toBeInTheDocument();
    expect(screen.getByText('MTDC')).toBeInTheDocument();
  });

  it('collapses fields when Show less is clicked', async () => {
    const user = userEvent.setup();
    render(<ProjectAdditionalInfo summary={createSummary()} />);

    await user.click(screen.getByRole('button', { name: 'Show more' }));
    expect(screen.getByText('Sponsor Award Number')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show less' }));
    expect(screen.queryByText('Sponsor Award Number')).not.toBeInTheDocument();
  });

  it('displays em-dash for null values', () => {
    render(
      <ProjectAdditionalInfo
        summary={createSummary({
          awardNumber: null,
          awardPi: null,
          awardStatus: null,
          billingCycle: null,
        })}
      />
    );

    // All null fields should show the em-dash fallback
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(4);
  });

  it('formats dates as MM.dd.yyyy', () => {
    render(
      <ProjectAdditionalInfo
        summary={createSummary({
          awardCloseDate: '2026-06-30',
          awardEndDate: '2026-12-31',
          awardStartDate: '2024-01-01',
        })}
      />
    );

    expect(screen.getByText('06.30.2026')).toBeInTheDocument();
    expect(screen.getByText('12.31.2026')).toBeInTheDocument();
    expect(screen.getByText('01.01.2024')).toBeInTheDocument();
  });

  it('shows em-dash for null dates', () => {
    render(
      <ProjectAdditionalInfo
        summary={createSummary({
          awardCloseDate: null,
          awardEndDate: null,
          awardStartDate: null,
        })}
      />
    );

    // The three date fields plus any other null fields should all show dashes
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });
});