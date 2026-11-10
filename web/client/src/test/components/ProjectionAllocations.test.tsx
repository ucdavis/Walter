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
  return screen.findByRole('dialog', { name: 'Edit funding for Alex Example' });
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

  it('replaces July through September, preserves both sides and actuals, and saves the resulting schedule', async () => {
    const plan = fullYearPlan();
    const { history, user } = openWorkspace(plan);
    await openJuly(user);
    expect(history.location.search).toContain('fundingMonth=2026-07');
    expect(screen.getByLabelText('Start date')).toHaveValue('2026-07-01');
    expect(screen.getByLabelText('End date')).toHaveValue('2026-07-31');
    date('End date', '2026-09-30');
    await user.selectOptions(screen.getByLabelText('Funding source 1'), '2');
    expect(read().pendingEditor).toMatchObject({
      appointmentId: 101,
      hasChanges: true,
      kind: 'allocation',
    });
    await user.click(screen.getByRole('button', { name: 'Apply funding' }));
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

  it('starts added allocations blank, allows outside funding and totals above 100% at zero FTE, and cancels without changing the plan', async () => {
    const plan = fullYearPlan();
    plan.content.appointments[0].fte = 0;
    plan.content.appointments[0].feeRemissionMonthly = 1500;
    const { user } = openWorkspace(plan);
    await openJuly(user);
    await user.click(screen.getByRole('button', { name: 'Add allocation' }));
    expect(screen.getByLabelText('Funding source 2')).toHaveValue('');
    expect(screen.getByLabelText('Appointment share 2 (%)')).toHaveValue('');
    expect(
      screen.getByRole('button', { name: 'Apply funding' })
    ).toBeDisabled();
    await user.selectOptions(
      screen.getByLabelText('Funding source 2'),
      'outside'
    );
    await user.type(screen.getByLabelText('Appointment share 2 (%)'), '50');
    expect(screen.getByRole('button', { name: 'Apply funding' })).toBeEnabled();
    expect(screen.getByText(/Total: 150% of appointment/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(read().draft).toEqual(plan);
    await openJuly(user);
    await user.selectOptions(
      screen.getByLabelText('Funding source 1'),
      'outside'
    );
    await user.click(screen.getByRole('button', { name: 'Apply funding' }));
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
    await user.click(screen.getByRole('button', { name: 'Apply funding' }));
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
    await user.click(screen.getByRole('button', { name: 'Apply funding' }));
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
    await user.click(screen.getByRole('button', { name: 'Apply funding' }));
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
      name: 'Edit funding for Alex Example',
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
    await user.click(
      screen.getByText('Funding gaps and overallocated funding')
    );
    expect(screen.getByText(/Checked through 2026-12-31/)).toBeVisible();
    expect(screen.getByText(/Overallocated funding: Apr 2026/)).toBeVisible();
  });
});
