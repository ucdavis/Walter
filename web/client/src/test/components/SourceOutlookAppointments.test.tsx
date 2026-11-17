import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SourceOutlookAppointments } from '@/components/projections/SourceOutlookAppointments.tsx';
import {
  computePiProjection,
  FRINGE_CATEGORY,
  SALARY_CATEGORY,
} from '@/lib/piProjection.ts';
import { createBookedSalaryExample } from '@/test/fixtures/projections.ts';
import { formatProjectionCurrency as money } from '@/components/projections/projectionFormatting.ts';

afterEach(cleanup);
function open(plan = createBookedSalaryExample()) {
  const results = computePiProjection(plan);
  const onNavigate = vi.fn();
  render(
    <SourceOutlookAppointments
      appointments={plan.content.appointments}
      onNavigate={onNavigate}
      results={results}
      source={plan.content.fundingSources[0]}
      sourceIdentity="Project A task 1"
    />
  );
  return { onNavigate, results, user: userEvent.setup() };
}

describe('staff costs by month', () => {
  it('distinguishes same-name appointments with their title and position', () => {
    const plan = createBookedSalaryExample();
    plan.content.appointments[0].title = 'Research specialist';
    plan.content.appointments[0].positionNumber = 'POSITION-A';
    plan.content.appointments.push({
      ...structuredClone(plan.content.appointments[0]),
      id: 102,
      positionNumber: 'POSITION-B',
    });
    open(plan);
    expect(
      screen.getByRole('row', { name: /Position POSITION-A/ })
    ).toHaveTextContent('Research specialist');
    expect(
      screen.getByRole('row', { name: /Position POSITION-B/ })
    ).toHaveTextContent('Research specialist');
  });

  it('aligns source-specific salary, fringe and fees with appointment totals and keeps expansion limited to cost rows in fullscreen', async () => {
    const plan = createBookedSalaryExample();
    plan.content.forecastMonths = 18;
    plan.content.appointments[0].feeRemissionMonthly = 600;
    const { results, user } = open(plan);
    expect(screen.getAllByRole('columnheader')).toHaveLength(20);
    const expected = results.appointmentCosts.find(
      ({ fundingSourceId, month }) =>
        fundingSourceId === 1 && month === '2026-02'
    )!;
    const appointmentRow = screen.getByRole('row', { name: /Alex Example/ });
    expect(appointmentRow.children[2]).toHaveTextContent(
      money(expected.salary + expected.fringe + expected.fees)
    );
    await user.click(screen.getByRole('button', { name: 'Alex Example' }));
    for (const [label, value] of [
      ['Salary', expected.salary],
      ['Fringe benefits', expected.fringe],
      ['Fee remission', expected.fees],
    ] as const) {
      expect(
        screen.getByRole('row', { name: new RegExp(`^${label} `) }).children[2]
      ).toHaveTextContent(money(value));
    }
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'Edit appointment for Alex Example',
      })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Expand table' }));
    expect(
      screen.getByText('Project A task 1', { selector: 'span' })
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Alex Example' })
    ).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.queryByText('Alex Example details and editors')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'Edit appointment for Alex Example',
      })
    ).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Expand table' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Alex Example' })
    ).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.queryByRole('region', { name: 'Alex Example appointment details' })
    ).not.toBeInTheDocument();
  });

  it('opens details independently and restores focus without collapsing the fullscreen worksheet', async () => {
    const { user } = open();
    const info = () =>
      screen.getByRole('button', {
        name: 'View appointment details for Alex Example',
      });
    const expand = () => screen.getByRole('button', { name: 'Alex Example' });
    await user.click(info());
    const details = screen.getByRole('dialog', { name: 'Alex Example' });
    expect(details).toHaveTextContent('50% appointment FTE');
    expect(details).toHaveTextContent('50% of appointment · 25% full-time FTE');
    expect(expand()).toHaveAttribute('aria-expanded', 'false');
    await user.click(
      within(details).getByRole('button', { name: 'Close alex example' })
    );
    expect(info()).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(expand());
    await user.click(screen.getByRole('button', { name: 'Expand table' }));
    await user.click(info());
    const fullscreenDetails = screen.getByRole('dialog', {
      name: 'Alex Example',
    });
    // jsdom does not dispatch the browser's native dialog cancel after Escape.
    await user.keyboard('{Escape}');
    fireEvent(fullscreenDetails, new Event('cancel', { cancelable: true }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Collapse table' })
    ).toBeVisible();
    expect(expand()).toHaveAttribute('aria-expanded', 'true');
    expect(info()).toHaveFocus();
    expect(screen.getByRole('row', { name: /^Salary / })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Expand table' })).toBeVisible();
  });

  it('retains editor access for saved future funding with no forecast charges', async () => {
    const plan = createBookedSalaryExample();
    const appointment = plan.content.appointments[0];
    appointment.startDate = '2027-03-15';
    appointment.endDate = '2027-12-31';
    appointment.allocations = [
      {
        endDate: '2027-09-30',
        fundingSourceId: 1,
        percent: 0.5,
        startDate: '2027-01-01',
      },
    ];
    const { onNavigate, user } = open(plan);
    await user.click(
      screen.getByRole('button', {
        name: 'View appointment details for Alex Example',
      })
    );
    expect(
      screen.getByText(
        'No funded share from this source is active in the forecast period.'
      )
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Edit allocations for Alex Example' })
    );
    expect(onNavigate).toHaveBeenLastCalledWith({
      appointment: 101,
      fundingDate: '2027-03-15',
      fundingMonth: '2027-03',
      section: 'staffing',
      source: 1,
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', {
        name: 'View appointment details for Alex Example',
      })
    );
    await user.click(
      screen.getByRole('button', { name: 'Edit appointment for Alex Example' })
    );
    expect(onNavigate).toHaveBeenLastCalledWith({
      appointment: 101,
      section: 'staffing',
      source: 1,
    });
  });

  it('opens the source-specific segment when funding changes midway through the month', async () => {
    const plan = createBookedSalaryExample();
    plan.content.appointments[0].allocations = [
      {
        endDate: '2026-01-15',
        fundingSourceId: 2,
        percent: 1,
        startDate: '2026-01-01',
      },
      {
        endDate: null,
        fundingSourceId: 1,
        percent: 1,
        startDate: '2026-01-16',
      },
    ];
    const { onNavigate, user } = open(plan);
    await user.click(
      screen.getByRole('button', {
        name: 'View appointment details for Alex Example',
      })
    );
    await user.click(
      screen.getByRole('button', { name: 'Edit allocations for Alex Example' })
    );
    expect(onNavigate).toHaveBeenLastCalledWith({
      appointment: 101,
      fundingDate: '2026-01-16',
      fundingMonth: '2026-01',
      section: 'staffing',
      source: 1,
    });
  });

  it('shows source-level salary and fringe adjustments even when they offset to zero', async () => {
    const plan = createBookedSalaryExample();
    plan.content.fundingSources[0].actuals = [
      {
        amount: 1000,
        expenditureCategory: SALARY_CATEGORY,
        month: '2026-01-01',
      },
      {
        amount: -1000,
        expenditureCategory: FRINGE_CATEGORY,
        month: '2026-01-01',
      },
    ];
    const { user } = open(plan);
    expect(screen.getByText(/The adjustment accounts for/)).toBeVisible();
    expect(
      screen.getByRole('row', { name: /^Starting-month adjustment / })
        .children[1]
    ).toHaveTextContent('$0');
    await user.click(
      screen.getByRole('button', { name: 'Starting-month adjustment' })
    );
    expect(
      screen.getByRole('row', { name: /^Salary adjustment / }).children[1]
    ).toHaveTextContent('-$1,000');
    expect(
      screen.getByRole('row', { name: /^Fringe adjustment / }).children[1]
    ).toHaveTextContent('$1,000');
  });

  it('does not invent a funding editor month when appointment and allocation dates never overlap', async () => {
    const plan = createBookedSalaryExample();
    plan.content.appointments[0].allocations = [
      {
        endDate: '2027-09-30',
        fundingSourceId: 1,
        percent: 0.5,
        startDate: '2027-01-01',
      },
    ];
    const { user } = open(plan);
    await user.click(
      screen.getByRole('button', {
        name: 'View appointment details for Alex Example',
      })
    );
    expect(
      screen.queryByRole('button', {
        name: 'Edit allocations for Alex Example',
      })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Edit appointment for Alex Example' })
    ).toBeVisible();
  });

  it('keeps later source captures absent in earlier plan month columns', async () => {
    const plan = createBookedSalaryExample();
    plan.content.fundingSources[0].capturedAt = '2026-03-01T00:00:00Z';
    const { user } = open(plan);
    const row = screen.getByRole('row', { name: /Alex Example/ });
    expect(row.children[1]).toHaveTextContent('—');
    expect(row.children[2]).toHaveTextContent('—');
    await user.click(within(row).getByRole('button', { name: 'Alex Example' }));
    expect(
      screen.getByRole('row', { name: /^Salary / }).children[1]
    ).toHaveTextContent('—');
  });
  it('keeps full-month estimates for multiple people and reconciles recorded costs only at source level', async () => {
    const plan = createBookedSalaryExample();
    const source = plan.content.fundingSources[0];
    const appointment = plan.content.appointments[0];
    appointment.feeRemissionMonthly = 600;
    plan.content.appointments.push({
      ...structuredClone(appointment),
      id: 102,
      name: 'Jordan Example',
    });
    source.expenses = [
      {
        amount: 123,
        description: 'Separate salary expense',
        endMonth: null,
        expenditureCategory: SALARY_CATEGORY,
        id: 1,
        kind: 'OneTime',
        startMonth: '2026-01-01',
      },
    ];
    const { results, user } = open(plan);
    expect(
      screen.getByRole('row', { name: /Alex Example/ }).children[1]
    ).toHaveTextContent('$3,800');
    expect(
      screen.getByRole('row', { name: /Jordan Example/ }).children[1]
    ).toHaveTextContent('$3,800');
    expect(
      screen.getByRole('row', { name: /^Estimated personnel costs / })
        .children[1]
    ).toHaveTextContent('$7,600');
    expect(
      screen.getByRole('row', { name: /^Starting-month adjustment / })
        .children[1]
    ).toHaveTextContent('-$1,400');
    const total = screen.getByRole('row', {
      name: /^Additional personnel forecast /,
    });
    expect(total.children[1]).toHaveTextContent('$6,200');
    const sourceForecast = results.rows
      .filter(({ fundingSourceId }) => fundingSourceId === source.id)
      .reduce((sum, row) => sum + row.projectedAmount, 0);
    expect(total.lastElementChild).toHaveTextContent(
      money(sourceForecast - 123)
    );
    await user.click(screen.getByRole('button', { name: 'Alex Example' }));
    expect(
      screen.getByRole('row', { name: /^Salary / }).children[1]
    ).toHaveTextContent('$2,500');
    expect(
      screen.getByRole('row', { name: /^Fringe benefits / }).children[1]
    ).toHaveTextContent('$1,000');
    expect(
      screen.getByRole('row', { name: /^Fee remission / }).children[1]
    ).toHaveTextContent('$300');
    await user.click(screen.getByRole('button', { name: 'Expand table' }));
    expect(screen.getByText(/The adjustment accounts for/)).toBeVisible();
  });

  it('caps recorded salary and fringe offsets without reducing fees or inventing per-person credits', () => {
    const plan = createBookedSalaryExample();
    plan.content.appointments[0].feeRemissionMonthly = 600;
    for (const actual of plan.content.fundingSources[0].actuals) {
      actual.amount = 50_000;
    }
    open(plan);
    expect(
      screen.getByRole('row', { name: /Alex Example/ }).children[1]
    ).toHaveTextContent('$3,800');
    expect(
      screen.getByRole('row', { name: /^Starting-month adjustment / })
        .children[1]
    ).toHaveTextContent('-$3,500');
    expect(
      screen.getByRole('row', { name: /^Additional personnel forecast / })
        .children[1]
    ).toHaveTextContent('$300');
  });

  it('shows positive recorded credits without appointments and omits adjustment when none is needed', () => {
    const plan = createBookedSalaryExample();
    plan.content.appointments = [];
    for (const actual of plan.content.fundingSources[0].actuals) {
      actual.amount *= -1;
    }
    open(plan);
    expect(
      screen.getByText('No appointments allocated to this source.')
    ).toBeVisible();
    expect(
      screen.getByRole('row', { name: /^Starting-month adjustment / })
        .children[1]
    ).toHaveTextContent('$1,400');
    expect(
      screen.getByRole('row', { name: /^Additional personnel forecast / })
        .children[1]
    ).toHaveTextContent('$1,400');
    cleanup();
    plan.content.fundingSources[0].actuals = [];
    plan.content.appointments =
      createBookedSalaryExample().content.appointments;
    open(plan);
    expect(
      screen.queryByRole('row', { name: /^Starting-month adjustment / })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/The adjustment accounts for/)
    ).not.toBeInTheDocument();
  });
});
