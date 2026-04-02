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
    expect(screen.getByText('Burden Schedule Rate')).toBeInTheDocument();
    expect(screen.getByText('26.5%')).toBeInTheDocument();
    expect(screen.getByText('Contract Administrator')).toBeInTheDocument();
    expect(screen.getByText('Admin, Carol')).toBeInTheDocument();
  });

  it('hides secondary fields and show more button for non-PMs', () => {
    render(<ProjectAdditionalInfo isProjectManager={false} summary={createSummary()} />);

    expect(screen.queryByText('Award Close Date')).not.toBeInTheDocument();
    expect(screen.queryByText('Billing Cycle')).not.toBeInTheDocument();
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

    expect(screen.getByText('Award Close Date')).toBeInTheDocument();
    expect(screen.getByText('Award PI')).toBeInTheDocument();
    expect(screen.getByText('Smith, Jane')).toBeInTheDocument();
    expect(screen.getByText('Billing Cycle')).toBeInTheDocument();
    expect(screen.getByText('Monthly')).toBeInTheDocument();
    expect(screen.getByText('Burden Structure')).toBeInTheDocument();
    expect(screen.getByText('MTDC')).toBeInTheDocument();
  });

  it('collapses fields when Show less is clicked', async () => {
    const user = userEvent.setup();
    render(<ProjectAdditionalInfo isProjectManager={true} summary={createSummary()} />);

    await user.click(screen.getByRole('button', { name: 'Show more' }));
    expect(screen.getByText('Billing Cycle')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show less' }));
    expect(screen.queryByText('Billing Cycle')).not.toBeInTheDocument();
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

  it('shows a tooltip for Burden Schedule Rate', async () => {
    const user = userEvent.setup();
    render(<ProjectAdditionalInfo isProjectManager={false} summary={createSummary()} />);

    const label = screen.getByText('Burden Schedule Rate');
    await user.hover(label.parentElement as HTMLElement);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      tooltipDefinitions.burdenScheduleRate
    );
  });

  it('shows tooltips for secondary award fields after expansion', async () => {
    const user = userEvent.setup();
    render(<ProjectAdditionalInfo isProjectManager={true} summary={createSummary()} />);

    await user.click(screen.getByRole('button', { name: 'Show more' }));

    const label = screen.getByText('Billing Cycle');
    await user.hover(label.parentElement as HTMLElement);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
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
