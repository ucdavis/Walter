import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import {
  createBrowserHistory,
  createMemoryHistory,
  RouterProvider,
} from '@tanstack/react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { createSalaryExample } from '@/test/fixtures/projections.ts';
import { createProjectionWorkspaceHarness } from '@/test/helpers/projectionWorkspace.tsx';

let workspace: ReturnType<typeof createProjectionWorkspaceHarness>;
const read = () => workspace.read();
const histories: ReturnType<typeof createMemoryHistory>[] = [];
afterEach(() => {
  cleanup();
  for (const history of histories) {
    history.destroy();
  }
  histories.length = 0;
  window.history.replaceState(null, '', '/');
});
function fullYearPlan() {
  const plan = createSalaryExample();
  plan.content.appointments[0].endDate = '2026-12-31';
  plan.content.appointments[0].allocations = [
    {
      endDate: '2026-12-31',
      fundingSourceId: 1,
      percent: 1,
      startDate: '2026-01-01',
    },
  ];
  for (const source of plan.content.fundingSources) {
    source.endDate = '2026-12-31';
  }
  return plan;
}
function openWorkspace(
  plan = fullYearPlan(),
  search = '?section=staffing',
  browser = false
) {
  if (browser) {
    window.history.replaceState(null, '', `/projections/TEST-PI/1${search}`);
  }
  const history = browser
    ? createBrowserHistory()
    : createMemoryHistory({
        initialEntries: [`/projections/TEST-PI/1${search}`],
      });
  histories.push(history);
  workspace = createProjectionWorkspaceHarness({ history, plan });
  render(<RouterProvider router={workspace.router} />);
  return { history, user: userEvent.setup() };
}
async function openJuly(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole('button', { name: /Alex Example, Jul 2026:/ })
  );
  return screen.findByRole('dialog', { name: 'Alex Example funding' });
}
function date(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('appointment allocation period editor', () => {
  it('focuses the start date and returns to the funding cell after Escape discards typing', async () => {
    const plan = fullYearPlan();
    const { user } = openWorkspace(plan);
    const dialog = await openJuly(user);
    expect(screen.getByLabelText('Start date')).toHaveFocus();
    await user.selectOptions(screen.getByLabelText('Funding source 1'), '2');
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(
      screen.getByRole('button', { name: /Alex Example, Jul 2026:/ })
    ).toHaveFocus();
    expect(read()).toMatchObject({ dirty: false, revision: 0 });
    expect(read().draft.content.appointments[0].allocations).toEqual(
      plan.content.appointments[0].allocations
    );
  });

  it('labels partial and open ranges honestly and discards changes with the close button', async () => {
    const plan = fullYearPlan();
    const { user } = openWorkspace(plan);
    await openJuly(user);
    date('Start date', '10000-07-15');
    expect(
      screen.getByRole('button', { name: 'Replace selected dates' })
    ).toBeDisabled();
    date('Start date', '2026-07-15');
    expect(
      screen.getByRole('button', { name: 'Replace selected dates' })
    ).toBeEnabled();
    await user.click(
      screen.getByRole('button', { name: 'Through appointment end' })
    );
    expect(
      screen.getByRole('button', { name: 'Replace through appointment end' })
    ).toBeEnabled();
    await user.click(
      screen.getByRole('button', { name: 'Entire appointment' })
    );
    expect(
      screen.getByRole('button', { name: 'Replace entire appointment' })
    ).toBeEnabled();
    await user.selectOptions(screen.getByLabelText('Funding source 1'), '2');
    await user.click(
      screen.getByRole('button', { name: 'Close funding editor' })
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(
      screen.getByRole('button', { name: /Alex Example, Jul 2026:/ })
    ).toHaveFocus();
    expect(read().draft.content.appointments[0].allocations).toEqual(
      plan.content.appointments[0].allocations
    );
    expect(read()).toMatchObject({ dirty: false, revision: 0 });
  });

  it('replaces July through September, preserves both sides and actuals, and saves the resulting schedule', async () => {
    const plan = fullYearPlan();
    const { history, user } = openWorkspace(plan);
    await openJuly(user);
    expect(history.location.search).toContain('fundingMonth=2026-07');
    expect(screen.getByLabelText('Start date')).toHaveValue('2026-07-01');
    expect(screen.getByLabelText('End date')).toHaveValue('2026-07-31');
    expect(
      screen.getByRole('button', { name: 'Replace 1 month' })
    ).toBeEnabled();
    date('End date', '2026-09-30');
    expect(
      screen.getByRole('button', { name: 'Replace 3 months' })
    ).toBeEnabled();
    await user.selectOptions(screen.getByLabelText('Funding source 1'), '2');
    expect(read().pendingEditor).toMatchObject({
      appointmentId: 101,
      hasChanges: true,
      kind: 'allocation',
    });
    await user.click(screen.getByRole('button', { name: /^Replace / }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(read().draft.content.appointments[0].allocations).toEqual(
      expect.arrayContaining([
        {
          endDate: '2026-06-30',
          fundingSourceId: 1,
          percent: 1,
          startDate: '2026-01-01',
        },
        {
          endDate: '2026-09-30',
          fundingSourceId: 2,
          percent: 1,
          startDate: '2026-07-01',
        },
        {
          endDate: '2026-12-31',
          fundingSourceId: 1,
          percent: 1,
          startDate: '2026-10-01',
        },
      ])
    );
    expect(read().draft.content.fundingSources).toEqual(
      plan.content.fundingSources
    );
    await user.click(screen.getByRole('button', { name: 'Save plan' }));
    await screen.findByRole('button', { name: '✓ Saved' });
    expect(workspace.server.read().stored!.content.appointments).toEqual(
      read().draft.content.appointments
    );
  });

  it('funds an active empty month and replaces the entire appointment with that split', async () => {
    const plan = fullYearPlan();
    plan.content.appointments[0].allocations = [
      {
        endDate: '2026-06-30',
        fundingSourceId: 1,
        percent: 1,
        startDate: null,
      },
      {
        endDate: null,
        fundingSourceId: 1,
        percent: 1,
        startDate: '2026-08-01',
      },
    ];
    const { user } = openWorkspace(plan);
    expect(
      await screen.findByRole('button', { name: 'Funding gaps' })
    ).toBeVisible();
    await openJuly(user);
    expect(screen.queryByLabelText('Funding source 1')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add allocation' }));
    await user.selectOptions(screen.getByLabelText('Funding source 1'), '2');
    expect(screen.getByLabelText('Appointment share 1 (%)')).toHaveValue('100');
    await user.click(screen.getByRole('button', { name: /^Replace / }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(
      screen.queryByRole('button', { name: 'Funding gaps' })
    ).not.toBeInTheDocument();
    expect(read().draft.content.appointments[0].allocations).toEqual([
      ...plan.content.appointments[0].allocations,
      {
        endDate: '2026-07-31',
        fundingSourceId: 2,
        percent: 1,
        startDate: '2026-07-01',
      },
    ]);
    await user.click(screen.getByRole('button', { name: 'Save plan' }));
    await screen.findByRole('button', { name: '✓ Saved' });
    expect(workspace.server.read().stored!.content.appointments).toEqual(
      read().draft.content.appointments
    );
    await openJuly(user);
    await user.click(
      screen.getByRole('button', { name: 'Entire appointment' })
    );
    await user.click(screen.getByRole('button', { name: /^Replace / }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(read().draft.content.appointments[0].allocations).toEqual([
      { endDate: null, fundingSourceId: 2, percent: 1, startDate: null },
    ]);
    await user.click(screen.getByRole('button', { name: 'Save plan' }));
    await screen.findByRole('button', { name: '✓ Saved' });
    expect(workspace.server.read().stored!.content.appointments).toEqual(
      read().draft.content.appointments
    );
  });

  it('explains why funding an inactive month cannot extend the appointment', async () => {
    const plan = fullYearPlan();
    plan.content.appointments[0].endDate = '2026-06-30';
    const { user } = openWorkspace(plan);
    await openJuly(user);
    expect(
      screen.getByText(/This period has no active appointment dates/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Jul 2026\s*Not active/ })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add allocation' }));
    await user.selectOptions(
      screen.getByLabelText('Funding source 1'),
      'outside'
    );
    expect(screen.getByLabelText('Appointment share 1 (%)')).toHaveValue('100');
    await user.click(screen.getByRole('button', { name: /^Replace / }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(read().draft.content.appointments[0].endDate).toBe('2026-06-30');
    expect(
      screen.getByRole('button', { name: /Alex Example, Jul 2026: Not active/ })
    ).toBeInTheDocument();
  });

  it('explains an expired source in an active month and allows replacing it', async () => {
    const plan = fullYearPlan();
    plan.content.fundingSources[0].endDate = '2026-06-30';
    const { user } = openWorkspace(plan);
    await openJuly(user);
    expect(
      screen.getByText(
        /Choose another funding source or edit its dates in Funding sources/
      )
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Funding source 1')).getByRole('group', {
        name: 'Outside selected dates',
      })
    ).toHaveTextContent('Project A');
    expect(
      screen.getByText(
        /No coverage in the selected period. This share stays unfunded throughout/
      )
    ).toBeInTheDocument();
    expect(screen.getByText('100% assigned')).toHaveClass('badge-warning');

    await user.click(
      screen.getByRole('button', { name: 'Entire appointment' })
    );
    expect(
      screen.getByText(
        /Entire appointment does not extend funding source dates/
      )
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Specific dates' }));
    await user.click(screen.getByRole('button', { name: /^Replace / }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(read().draft.content.appointments[0].allocations).toEqual(
      plan.content.appointments[0].allocations
    );
    expect(
      screen.getByRole('button', {
        name: /Alex Example, Jul 2026: Funding gaps/,
      })
    ).toBeInTheDocument();
    await openJuly(user);
    await user.selectOptions(screen.getByLabelText('Funding source 1'), '2');
    await user.click(screen.getByRole('button', { name: /^Replace / }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(
      screen.getByRole('button', {
        name: /Alex Example, Jul 2026: 100% funded/,
      })
    ).toBeInTheDocument();
  });

  it.each([0.25, 0.123_456_789_012_345])(
    'defaults a new share to the exact remainder of %s, including outside funding',
    async (percent) => {
      const plan = fullYearPlan();
      plan.content.appointments[0].allocations[0].percent = percent;
      plan.content.appointments[0].allocations[0].fundingSourceId = null;
      const { user } = openWorkspace(plan);
      await openJuly(user);
      await user.click(screen.getByRole('button', { name: 'Add allocation' }));
      expect(screen.getByLabelText('Funding source 2')).toHaveValue('');
      expect(screen.getByLabelText('Appointment share 2 (%)')).toHaveValue(
        String(Number(((1 - percent) * 100).toPrecision(12)))
      );
      await user.selectOptions(screen.getByLabelText('Funding source 2'), '2');
      await user.click(screen.getByRole('button', { name: /^Replace / }));
      expect(read().draft.content.appointments[0].allocations).toContainEqual({
        endDate: '2026-07-31',
        fundingSourceId: 2,
        percent: 1 - percent,
        startDate: '2026-07-01',
      });
      expect(read().draft.content.appointments[0].allocations).toContainEqual({
        endDate: '2026-07-31',
        fundingSourceId: null,
        percent,
        startDate: '2026-07-01',
      });
    }
  );

  it('leaves the default blank when an existing percentage is invalid or overallocated', async () => {
    const { user } = openWorkspace();
    await openJuly(user);
    for (const value of ['', 'not a percentage', '-10', '150']) {
      const input = screen.getByLabelText('Appointment share 1 (%)');
      await user.clear(input);
      if (value) {
        await user.type(input, value);
      }
      await user.click(screen.getByRole('button', { name: 'Add allocation' }));
      expect(screen.getByLabelText('Appointment share 2 (%)')).toHaveValue('');
      await user.click(
        screen.getByRole('button', { name: 'Remove allocation 2' })
      );
    }
  });

  it('groups sources by exact active date coverage and updates groups when dates or modes change', async () => {
    const plan = fullYearPlan();
    plan.content.appointments[0].endDate = '2026-07-20';
    plan.content.fundingSources[0].endDate = '2026-07-20';
    plan.content.fundingSources[1].startDate = '2026-07-15';
    const { user } = openWorkspace(plan);
    await openJuly(user);
    const sourceSelect = screen.getByLabelText('Funding source 1');
    expect(
      within(sourceSelect).getByRole('group', { name: 'Covers selected dates' })
    ).toHaveTextContent('Project A');
    expect(
      within(sourceSelect).getByRole('group', {
        name: 'Partly covers selected dates',
      })
    ).toHaveTextContent('Project B');
    await user.selectOptions(sourceSelect, '2');
    expect(screen.getByText('100% assigned')).toHaveClass('badge-warning');
    expect(
      screen.getByText(/Partial coverage. This share stays unfunded/)
    ).toBeInTheDocument();
    date('Start date', '2026-07-15');
    date('End date', '2026-07-15');
    expect(
      within(sourceSelect).getByRole('group', { name: 'Covers selected dates' })
    ).toHaveTextContent('Project B');
    expect(screen.getByText('100% allocated')).toBeInTheDocument();
    date('End date', '2026-07-14');
    expect(
      within(sourceSelect).getByRole('group', { name: 'Check selected dates' })
    ).toHaveTextContent('Project A');
    await user.click(
      screen.getByRole('button', { name: 'Through appointment end' })
    );
    expect(
      within(sourceSelect).getByRole('group', { name: 'Covers selected dates' })
    ).toHaveTextContent('Project B');
    await user.click(
      screen.getByRole('button', { name: 'Entire appointment' })
    );
    expect(
      within(sourceSelect).getByRole('group', {
        name: 'Partly covers selected dates',
      })
    ).toHaveTextContent('Project B');
    expect(sourceSelect).toHaveValue('2');
  });

  it('leaves added allocations blank at full allocation, allows outside funding and totals above 100% at zero FTE, and cancels without changing the plan', async () => {
    const plan = fullYearPlan();
    plan.content.appointments[0].fte = 0;
    plan.content.appointments[0].feeRemissionMonthly = 1500;
    const { user } = openWorkspace(plan);
    await openJuly(user);
    await user.click(screen.getByRole('button', { name: 'Add allocation' }));
    expect(screen.getByLabelText('Funding source 2')).toHaveValue('');
    expect(screen.getByLabelText('Appointment share 2 (%)')).toHaveValue('');
    expect(screen.getByRole('button', { name: /^Replace / })).toBeDisabled();
    await user.selectOptions(
      screen.getByLabelText('Funding source 2'),
      'outside'
    );
    await user.type(screen.getByLabelText('Appointment share 2 (%)'), '50');
    expect(screen.getByRole('button', { name: /^Replace / })).toBeEnabled();
    expect(screen.getByText(/Total: 150% of appointment/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(read().draft).toEqual(plan);
    await openJuly(user);
    await user.selectOptions(
      screen.getByLabelText('Funding source 1'),
      'outside'
    );
    await user.click(screen.getByRole('button', { name: /^Replace / }));
    expect(read().draft.content.appointments[0].allocations).toContainEqual({
      endDate: '2026-07-31',
      fundingSourceId: null,
      percent: 1,
      startDate: '2026-07-01',
    });
  });

  it('exposes explicit appointment date shortcuts and clears only the selected period when every share is removed', async () => {
    const { user } = openWorkspace();
    await openJuly(user);
    await user.click(
      screen.getByRole('button', { name: 'Through appointment end' })
    );
    expect(screen.getByLabelText('End date')).toBeDisabled();
    expect(screen.getByText('Uses appointment end')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Funding source 1'), '2');
    await user.click(screen.getByRole('button', { name: /^Replace / }));
    expect(read().draft.content.appointments[0].allocations).toContainEqual({
      endDate: null,
      fundingSourceId: 2,
      percent: 1,
      startDate: '2026-07-01',
    });
    await openJuly(user);
    await user.click(
      screen.getByRole('button', { name: 'Entire appointment' })
    );
    expect(screen.getByLabelText('Start date')).toBeDisabled();
    expect(screen.getByLabelText('End date')).toBeDisabled();
    await user.click(
      screen.getByRole('button', { name: 'Remove allocation 1' })
    );
    expect(
      screen.getByText(/Applying will leave the selected period unallocated/)
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Replace / }));
    expect(read().draft.content.appointments[0].allocations).toEqual([]);
    expect(screen.getByText('No funding assigned.')).toBeInTheDocument();
  });

  it('keeps precise split dates and rates when opening a mixed month and acknowledges the imported funding review on Apply', async () => {
    const plan = fullYearPlan();
    const allocations = [
      {
        endDate: '2026-07-14',
        fundingSourceId: 1,
        percent: 0.333_333_333_333_333_3,
        startDate: '2026-01-01',
      },
      {
        endDate: '2026-12-31',
        fundingSourceId: 2,
        percent: 0.5,
        startDate: '2026-07-15',
      },
    ];
    plan.content.appointments[0].allocations = allocations;
    plan.content.appointments[0].hasUnmatchedFunding = true;
    const { user } = openWorkspace(plan);
    await openJuly(user);
    expect(screen.getByLabelText('Start date')).toHaveValue('2026-07-01');
    expect(screen.getByLabelText('End date')).toHaveValue('2026-07-14');
    expect(
      screen.getByText(/Funding changes within Jul 2026/)
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Replace / }));
    expect(read().draft.content.appointments[0].allocations).toEqual(
      allocations
    );
    expect(read().draft.content.appointments[0].hasUnmatchedFunding).toBe(
      false
    );
  });

  it('preserves pending edits when departure is cancelled and restores saved values with Back and Forward', async () => {
    const { history, user } = openWorkspace(
      fullYearPlan(),
      '?section=staffing',
      true
    );
    await openJuly(user);
    await user.selectOptions(screen.getByLabelText('Funding source 1'), '2');
    await act(async () => {
      history.back();
    });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(read().revision).toBe(0);
    await act(async () => {
      history.forward();
    });
    await screen.findByRole('dialog', {
      name: 'Alex Example funding',
    });
    expect(screen.getByLabelText('Funding source 1')).toHaveValue('1');
    await user.selectOptions(screen.getByLabelText('Funding source 1'), '2');
    expect(read().pendingEditor).toMatchObject({
      hasChanges: true,
      kind: 'allocation',
    });
    act(() => {
      void workspace.router.navigate({ to: '/projections/TEST-PI' });
    });
    const guard = await screen.findByRole('dialog', {
      name: 'Leave this plan?',
    });
    await user.click(within(guard).getByRole('button', { name: 'Stay' }));
    expect(screen.getByLabelText('Funding source 1')).toHaveValue('2');
  });

  it('shows separate daily gap and overlap warnings even when the monthly average is 100%', async () => {
    const plan = fullYearPlan();
    plan.content.appointments[0].allocations = [
      {
        endDate: '2026-04-30',
        fundingSourceId: 1,
        percent: 1,
        startDate: '2026-04-16',
      },
      {
        endDate: '2026-04-30',
        fundingSourceId: 2,
        percent: 1,
        startDate: '2026-04-16',
      },
    ];
    const { user } = openWorkspace(plan);
    await screen.findByRole('button', {
      name: /Alex Example, Apr 2026: Funding gaps and overallocations/,
    });
    await user.click(screen.getByRole('button', { name: 'Funding gaps' }));
    expect(
      await screen.findByText('Partially allocated April 2026')
    ).toBeVisible();
    expect(screen.getByText('Unallocated January–March 2026')).toBeVisible();
    expect(screen.getByText('Unallocated May–December 2026')).toBeVisible();
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    );
    await user.click(
      screen.getByRole('button', { name: 'Overallocated funding' })
    );
    expect(await screen.findByText('Overallocated April 2026')).toBeVisible();
  });
});
