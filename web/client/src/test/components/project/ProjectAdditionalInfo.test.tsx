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
    render(<ProjectAdditionalInfo isProjectManager={false} summary={createSummary()} />);

    expect(screen.getByText('Award Information')).toBeInTheDocument();
  });

  it('shows primary award fields for all users', () => {
    render(<ProjectAdditionalInfo isProjectManager={false} summary={createSummary()} />);

    expect(screen.getByText('Award Number')).toBeInTheDocument();
    expect(screen.getByText('AWD-100')).toBeInTheDocument();
    expect(screen.getByText('Award Name')).toBeInTheDocument();
    expect(screen.getByText('Test Award')).toBeInTheDocument();
    expect(screen.getByText('Award End Date')).toBeInTheDocument();
    expect(screen.getByText('Primary Sponsor Name')).toBeInTheDocument();
    expect(screen.getByText('National Science Foundation')).toBeInTheDocument();
    expect(screen.getByText('Sponsor Award Number')).toBeInTheDocument();
    expect(screen.getByText('NSF-2024-001')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Burden Schedule Rate' })
    ).toBeInTheDocument();
    expect(screen.getByText('26.5%')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Contract Administrator' })
    ).toBeInTheDocument();
    expect(screen.getByText('Admin, Carol')).toBeInTheDocument();
  });

  it('hides secondary fields and show more button for non-PMs', () => {
    render(<ProjectAdditionalInfo isProjectManager={false} summary={createSummary()} />);

    expect(
      screen.queryByRole('button', { name: 'Award Close Date' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Billing Cycle' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show more/i })).not.toBeInTheDocument();
  });

  it('shows Show more button for PMs', () => {
    render(<ProjectAdditionalInfo isProjectManager={true} summary={createSummary()} />);

    expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument();
  });

  it('reveals hidden fields when PM clicks Show more', async () => {
    const user = userEvent.setup();
    render(<ProjectAdditionalInfo isProjectManager={true} summary={createSummary()} />);

    await user.click(screen.getByRole('button', { name: 'Show more' }));

    expect(
      screen.getByRole('button', { name: 'Award Close Date' })
    ).toBeInTheDocument();
    expect(screen.getByText('Award PI')).toBeInTheDocument();
    expect(screen.getByText('Smith, Jane')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Billing Cycle' })).toBeInTheDocument();
    expect(screen.getByText('Monthly')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Burden Structure' })
    ).toBeInTheDocument();
    expect(screen.getByText('MTDC')).toBeInTheDocument();
  });

  it('collapses fields when Show less is clicked', async () => {
    const user = userEvent.setup();
    render(<ProjectAdditionalInfo isProjectManager={true} summary={createSummary()} />);

    await user.click(screen.getByRole('button', { name: 'Show more' }));
    expect(screen.getByRole('button', { name: 'Billing Cycle' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show less' }));
    expect(
      screen.queryByRole('button', { name: 'Billing Cycle' })
    ).not.toBeInTheDocument();
  });

  it('displays em-dash for null values', () => {
    render(
      <ProjectAdditionalInfo
        isProjectManager={false}
        summary={createSummary({
          awardName: null,
          contractAdministrator: null,
        })}
      />
    );

    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('formats dates as MM.dd.yyyy', () => {
    render(
      <ProjectAdditionalInfo
        isProjectManager={false}
        summary={createSummary({
          awardEndDate: '2026-12-31',
          awardStartDate: '2024-01-01',
        })}
      />
    );

    expect(screen.getByText('12.31.2026')).toBeInTheDocument();
    expect(screen.getByText('01.01.2024')).toBeInTheDocument();
  });

  it('opens a drawer for Burden Schedule Rate', async () => {
    const user = userEvent.setup();
    render(<ProjectAdditionalInfo isProjectManager={false} summary={createSummary()} />);

    await user.click(screen.getByRole('button', { name: 'Burden Schedule Rate' }));

    expect(await screen.findByRole('dialog', { name: 'Burden Schedule Rate' })).toHaveTextContent(
      tooltipDefinitions.burdenScheduleRate
    );
  });

  it('opens drawers for secondary award fields after expansion', async () => {
    const user = userEvent.setup();
    render(<ProjectAdditionalInfo isProjectManager={true} summary={createSummary()} />);

    await user.click(screen.getByRole('button', { name: 'Show more' }));

    await user.click(screen.getByRole('button', { name: 'Billing Cycle' }));

    expect(await screen.findByRole('dialog', { name: 'Billing Cycle' })).toHaveTextContent(
      tooltipDefinitions.billingCycle
    );
  });

  it('renders nothing when awardNumber is null (internal project)', () => {
    const { container } = render(
      <ProjectAdditionalInfo isProjectManager={false} summary={createSummary({ awardNumber: null })} />
    );

    expect(container.innerHTML).toBe('');
    expect(screen.queryByText('Award Information')).not.toBeInTheDocument();
  });
});
