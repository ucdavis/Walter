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
function openWorkspace(
  plan = createSalaryExample(),
  browser = false,
  search = '?section=overview'
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
  return userEvent.setup();
}
async function openDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole('button', { name: 'Edit plan details' })
  );
  return screen.findByRole('dialog', { name: 'Edit plan details' });
}
async function enter(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  value: string
) {
  const input = screen.getByLabelText(label);
  await user.clear(input);
  if (value) {
    await user.type(input, value);
  }
}

describe('projection plan details', () => {
  it('keeps an open unapplied details buffer when a prior save is acknowledged', async () => {
    const user = openWorkspace();
    await openDetails(user);
    await user.selectOptions(screen.getByLabelText('Forecast duration'), '18');
    await user.click(
      screen.getByRole('button', { name: 'Apply plan details' })
    );
    const server = workspace.server;
    act(() => server.setHold(true));
    await user.click(screen.getByRole('button', { name: 'Save plan' }));
    await screen.findByRole('button', { name: 'Saving…' });
    await openDetails(user);
    await enter(user, 'Plan notes (optional)', 'Unapplied note');
    act(() => server.finishNextSave());
    await screen.findByRole('button', { name: '✓ Saved' });
    expect(screen.getByLabelText('Plan notes (optional)')).toHaveValue(
      'Unapplied note'
    );
    expect(read().pendingEditor).toMatchObject({
      hasChanges: true,
      kind: 'details',
    });
    expect(read().draft.content.notes).toBeNull();
    expect(server.read().stored!.content.notes).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(read().dirty).toBe(false);
  });

  it('keeps name, duration and plain multiline notes pending until Apply, then saves all metadata explicitly', async () => {
    const plan = createSalaryExample();
    const user = openWorkspace(plan);
    await openDetails(user);
    expect(screen.getByLabelText('Forecast duration')).toHaveValue('12');
    expect(screen.getByLabelText('Plan notes (optional)')).toHaveAttribute(
      'maxLength',
      '2000'
    );
    await enter(user, 'Plan name', 'Longer plan');
    await user.selectOptions(screen.getByLabelText('Forecast duration'), '18');
    await enter(
      user,
      'Plan notes (optional)',
      '<b>Planning assumption</b>\n  Second line'
    );
    expect(
      screen.getByText('Forecast from Jan 2026 through Jun 2027.')
    ).toBeInTheDocument();
    expect(read().pendingEditor).toMatchObject({
      hasChanges: true,
      kind: 'details',
    });
    expect(read().draft).toEqual(plan);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(read().revision).toBe(0);
    await openDetails(user);
    expect(screen.getByLabelText('Plan name')).toHaveValue(plan.name);
    await enter(user, 'Plan name', 'Longer plan');
    await user.selectOptions(screen.getByLabelText('Forecast duration'), '18');
    const notes = '<b>Planning assumption</b>\n  Second line';
    await enter(user, 'Plan notes (optional)', notes);
    await user.click(
      screen.getByRole('button', { name: 'Apply plan details' })
    );
    expect(read().draft).toMatchObject({
      content: { forecastMonths: 18, notes },
      name: 'Longer plan',
    });
    const visibleNotes = screen.getByRole('region', { name: 'Plan notes' });
    expect(visibleNotes).toHaveTextContent('<b>Planning assumption</b>');
    expect(visibleNotes.querySelector('b')).toBeNull();
    expect(visibleNotes.querySelector('p')!.textContent).toBe(notes);
    expect(read().draft.content.fundingSources).toEqual(
      plan.content.fundingSources
    );
    expect(read().draft.content.appointments).toEqual(
      plan.content.appointments
    );
    expect(workspace.server.read().stored!.content.forecastMonths).toBe(12);
    await user.click(screen.getByRole('button', { name: 'Save plan' }));
    await screen.findByRole('button', { name: '✓ Saved' });
    expect(workspace.server.read().stored).toMatchObject({
      content: { forecastMonths: 18, notes },
      name: 'Longer plan',
      seededAt: plan.seededAt,
    });
  });

  it('requires a plan name, rejects notes over the limit, and clears notes with whitespace-only input', async () => {
    const plan = createSalaryExample();
    plan.content.notes = 'Existing note';
    const user = openWorkspace(plan);
    await openDetails(user);
    await enter(user, 'Plan name', '   ');
    expect(
      screen.getByRole('button', { name: 'Apply plan details' })
    ).toBeDisabled();
    await enter(user, 'Plan name', 'Renamed');
    fireEvent.change(screen.getByLabelText('Plan notes (optional)'), {
      target: { value: 'x'.repeat(2001) },
    });
    expect(
      screen.getByRole('button', { name: 'Apply plan details' })
    ).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('2000');
    await enter(user, 'Plan notes (optional)', '  \n  ');
    await user.click(
      screen.getByRole('button', { name: 'Apply plan details' })
    );
    expect(read().draft.content.notes).toBeNull();
    expect(
      screen.queryByRole('region', { name: 'Plan notes' })
    ).not.toBeInTheDocument();
  });

  it('updates open-ended historical and manual totals through the common plan end while fixed expense dates stay fixed', async () => {
    const plan = createSalaryExample();
    const source = plan.content.fundingSources[0];
    source.endDate = null;
    source.runRates = [
      {
        expenditureCategory: '05 - Supplies',
        historyMonths: 3,
        monthlyAmount: 310,
      },
    ];
    source.expenses = [
      {
        amount: 310,
        description: 'Open monthly',
        endMonth: null,
        expenditureCategory: '05 - Supplies',
        id: 1,
        kind: 'Monthly',
        startMonth: '2026-01-01',
      },
      {
        amount: 310,
        description: 'Fixed monthly',
        endMonth: '2026-03-01',
        expenditureCategory: '05 - Supplies',
        id: 2,
        kind: 'Monthly',
        startMonth: '2026-01-01',
      },
    ];
    const user = openWorkspace(plan, false, '?section=expenses&source=1');
    await screen.findByRole('heading', { name: 'Other expenses' });
    const row = (name: string) => screen.getByText(name).closest('tr')!;
    expect(
      within(row('Open monthly')).getByText('$3,710.00')
    ).toBeInTheDocument();
    expect(
      within(row('Fixed monthly')).getByText('$920.00')
    ).toBeInTheDocument();
    await openDetails(user);
    await user.selectOptions(screen.getByLabelText('Forecast duration'), '18');
    await user.click(
      screen.getByRole('button', { name: 'Apply plan details' })
    );
    expect(
      within(row('Open monthly')).getByText('$5,570.00')
    ).toBeInTheDocument();
    expect(
      within(row('Open monthly')).getByText(/Jan 2026 through Jun 2027/)
    ).toBeInTheDocument();
    expect(
      within(row('Fixed monthly')).getByText('$920.00')
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole('region', { name: 'Historical expense estimates' })
      ).getByText('$5,570.00')
    ).toBeInTheDocument();
    expect(read().draft.content.fundingSources[0].expenses).toEqual(
      source.expenses
    );
    await user.click(
      screen.getByRole('button', { name: 'Edit expense Open monthly' })
    );
    expect(
      screen.getByText(/Through forecast end: Jun 2027/)
    ).toBeInTheDocument();
  });

  it('shows a future source without including its planning balance in the current period', async () => {
    const plan = createSalaryExample();
    const future = plan.content.fundingSources[1];
    future.sourceKind = 'Planned';
    future.startDate = '2027-03-01';
    future.endDate = null;
    const user = openWorkspace(plan);
    await screen.findByRole('button', { name: 'View Project B' });
    const row = () =>
      screen.getByRole('button', { name: 'View Project B' }).closest('tr')!;
    expect(
      within(row()).getByText('Outside forecast period')
    ).toBeInTheDocument();
    expect(within(row()).getAllByRole('cell').at(-1)).toHaveTextContent('—');
    expect(read().results.rows.some((row) => row.fundingSourceId === 2)).toBe(
      false
    );
    await openDetails(user);
    await user.selectOptions(screen.getByLabelText('Forecast duration'), '18');
    await user.click(
      screen.getByRole('button', { name: 'Apply plan details' })
    );
    expect(
      within(row()).queryByText('Outside forecast period')
    ).not.toBeInTheDocument();
    expect(read().results.rows.some((row) => row.fundingSourceId === 2)).toBe(
      true
    );
    expect(read().results.forecastWindow.endMonth).toBe('2027-06');
  });

  it('retains newer metadata after a delayed save and submits it with the next explicit Save', async () => {
    const user = openWorkspace();
    await openDetails(user);
    await user.selectOptions(screen.getByLabelText('Forecast duration'), '18');
    await enter(user, 'Plan notes (optional)', 'First submitted note');
    await user.click(
      screen.getByRole('button', { name: 'Apply plan details' })
    );
    const server = workspace.server;
    act(() => server.setHold(true));
    await user.click(screen.getByRole('button', { name: 'Save plan' }));
    await screen.findByRole('button', { name: 'Saving…' });
    await openDetails(user);
    await enter(user, 'Plan name', 'Newer draft');
    await enter(user, 'Plan notes (optional)', 'Newer note');
    await user.selectOptions(screen.getByLabelText('Forecast duration'), '12');
    await user.click(
      screen.getByRole('button', { name: 'Apply plan details' })
    );
    act(() => server.finishNextSave());
    await screen.findByText(
      'Submitted changes were saved. Newer edits are still unsaved.'
    );
    expect(server.read().stored).toMatchObject({
      content: { forecastMonths: 18, notes: 'First submitted note' },
    });
    expect(read().draft).toMatchObject({
      content: { forecastMonths: 12, notes: 'Newer note' },
      name: 'Newer draft',
    });
    expect(read().dirty).toBe(true);
    act(() => server.setHold(false));
    await user.click(screen.getByRole('button', { name: 'Save plan' }));
    await screen.findByRole('button', { name: '✓ Saved' });
    expect(server.read().stored).toMatchObject({
      content: { forecastMonths: 12, notes: 'Newer note' },
      name: 'Newer draft',
    });
  });

  it('guards unapplied metadata on departure and preserves typing after Stay', async () => {
    const user = openWorkspace(createSalaryExample(), true);
    await openDetails(user);
    await enter(user, 'Plan notes (optional)', 'Still typing');
    act(() => {
      void workspace.router.navigate({ to: '/projections/TEST-PI' });
    });
    const guard = await screen.findByRole('dialog', {
      name: 'Leave this plan?',
    });
    await user.click(within(guard).getByRole('button', { name: 'Stay' }));
    expect(screen.getByLabelText('Plan notes (optional)')).toHaveValue(
      'Still typing'
    );
    expect(read().draft.content.notes).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(read().dirty).toBe(false);
    act(() => {
      void workspace.router.navigate({ to: '/projections/TEST-PI' });
    });
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Plans' })).toBeInTheDocument()
    );
  });
});
