import { createRef } from 'react';
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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AppointmentEditor,
  type AppointmentEditorHandle,
} from '@/components/projections/AppointmentEditor.tsx';
import {
  createAppointmentLookupsExample,
  createSalaryExample,
} from '@/test/fixtures/projections.ts';
import { createProjectionWorkspaceHarness } from '@/test/helpers/projectionWorkspace.tsx';
import { projectionLookupsQueryOptions } from '@/queries/projections.ts';
import { server } from '@/test/mswUtils.ts';

afterEach(cleanup);

function openWorkspace(plan = createSalaryExample(), editing = true) {
  const history = createMemoryHistory({
    initialEntries: [
      `/projections/TEST-PI/1?section=staffing${editing ? '&appointment=101' : ''}`,
    ],
  });
  workspace = createProjectionWorkspaceHarness({ history, plan });
  render(<RouterProvider router={workspace.router} />);
  return userEvent.setup();
}
let workspace: ReturnType<typeof createProjectionWorkspaceHarness>;
const read = () => workspace.read();
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

describe('appointment planning controls', () => {
  it('keeps captured precision on unchanged Apply and preserves allocations and actuals while editing FTE, rates, fees, and dates', async () => {
    const plan = createSalaryExample();
    Object.assign(plan.content.appointments[0], {
      cbrRate: 0.123_456_789,
      colaRate: 0.031_234_567,
      feeRemissionMonthly: 123.456_789,
      monthlySalary: 10_000.123_45,
      vacationAccrualRate: 0.041_234_5,
    });
    const user = openWorkspace(plan);
    await screen.findByLabelText('Full-time annual salary');
    expect(screen.queryByLabelText('Appointment name')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(read().draft.content.appointments).toEqual(
      plan.content.appointments
    );
    expect(read().revision).toBe(0);
    await user.click(
      screen.getByRole('button', { name: 'Edit appointment for Alex Example' })
    );
    await enter(user, 'FTE (%)', '0');
    await enter(user, 'CBR (%)', '25');
    await enter(user, 'Annual adjustment (%)', '-3');
    await user.selectOptions(screen.getByLabelText('Adjustment month'), '10');
    await enter(user, 'Monthly fee remission', '1500');
    fireEvent.change(screen.getByLabelText('Start date'), {
      target: { value: '2026-02-15' },
    });
    fireEvent.change(screen.getByLabelText('End date'), {
      target: { value: '2026-05-10' },
    });
    expect(read().pendingEditor?.hasChanges).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(read().draft.content.appointments).toEqual(
      plan.content.appointments
    );
    await user.click(
      screen.getByRole('button', { name: 'Edit appointment for Alex Example' })
    );
    await enter(user, 'FTE (%)', '0');
    await enter(user, 'CBR (%)', '25');
    await enter(user, 'Annual adjustment (%)', '-3');
    await user.selectOptions(screen.getByLabelText('Adjustment month'), '10');
    await enter(user, 'Monthly fee remission', '1500');
    fireEvent.change(screen.getByLabelText('Start date'), {
      target: { value: '2026-02-15' },
    });
    fireEvent.change(screen.getByLabelText('End date'), {
      target: { value: '2026-05-10' },
    });
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(read().draft.content.appointments[0]).toMatchObject({
      cbrRate: 0.25,
      colaMonth: 10,
      colaRate: -0.03,
      endDate: '2026-05-10',
      feeRemissionMonthly: 1500,
      fte: 0,
      monthlySalary: 10_000.123_45,
      startDate: '2026-02-15',
      vacationAccrualRate: 0.041_234_5,
    });
    expect(read().draft.content.appointments[0].allocations).toEqual(
      plan.content.appointments[0].allocations
    );
    expect(read().draft.content.fundingSources).toEqual(
      plan.content.fundingSources
    );
    expect(
      screen.getByText('Research specialist · 0% FTE')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Allocation dates and shares')
    ).not.toBeInTheDocument();
  });

  it('keeps an imported zero CBR until an explicit lookup or manual change and never changes vacation accrual', async () => {
    const plan = createSalaryExample();
    Object.assign(plan.content.appointments[0], {
      cbrRate: 0,
      jobCode: 'EXAMPLE',
      vacationAccrualRate: 0.0123,
    });
    const user = openWorkspace(plan);
    await screen.findByLabelText('CBR (%)');
    expect(screen.getByLabelText('CBR (%)')).toHaveValue('0');
    await user.click(screen.getByRole('button', { name: 'Use 30% CBR' }));
    expect(screen.getByLabelText('CBR (%)')).toHaveValue('30');
    await enter(user, 'CBR (%)', '17.5');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(read().draft.content.appointments[0].cbrRate).toBe(0.175);
    expect(read().draft.content.appointments[0].vacationAccrualRate).toBe(
      0.0123
    );
    await user.click(
      screen.getByRole('button', { name: 'Edit appointment for Alex Example' })
    );
    expect(screen.getByLabelText('CBR (%)')).toHaveValue('17.5');
    await user.click(screen.getByRole('button', { name: 'Use 30% CBR' }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(read().draft.content.appointments[0].cbrRate).toBe(0.3);
    expect(read().draft.content.appointments[0].vacationAccrualRate).toBe(
      0.0123
    );
  });

  it('adds a future unallocated hire from server defaults and confirms removal without changing recorded finances', async () => {
    const plan = createSalaryExample();
    const user = openWorkspace(plan, false);
    await user.click(
      await screen.findByRole('button', { name: 'Add hypothetical hire' })
    );
    expect(screen.getByLabelText('FTE (%)')).toHaveValue('100');
    expect(screen.getByLabelText('CBR (%)')).toHaveValue('20');
    expect(screen.getByLabelText('Annual adjustment (%)')).toHaveValue('3');
    expect(screen.getByLabelText('Adjustment month')).toHaveValue('7');
    expect(screen.getByLabelText('Monthly fee remission')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    await enter(user, 'Appointment name', 'Future hire');
    await enter(user, 'Full-time annual salary', '120000');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Start date'), {
      target: { value: '2028-08-01' },
    });
    await user.selectOptions(screen.getByLabelText('Job code'), 'EXAMPLE');
    await user.selectOptions(screen.getByLabelText('Business unit'), 'UCANR');
    expect(screen.getByLabelText('CBR (%)')).toHaveValue('20');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await screen.findByText('No funding assigned.');
    expect(read().draft.content.appointments[1]).toMatchObject({
      allocations: [],
      cbrRate: 0.2,
      colaMonth: 7,
      colaRate: 0.03,
      employeeId: null,
      endDate: null,
      feeRemissionMonthly: null,
      fte: 1,
      isSeeded: false,
      jobCode: 'EXAMPLE',
      name: 'Future hire',
      positionNumber: null,
      rateSet: 'UCANR',
      startDate: '2028-08-01',
      vacationAccrualRate: 0,
    });
    await user.click(
      screen.getByRole('button', { name: 'Remove appointment for Future hire' })
    );
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' })
    );
    expect(read().draft.content.appointments).toHaveLength(2);
    await user.click(
      screen.getByRole('button', { name: 'Remove appointment for Future hire' })
    );
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' })
    );
    expect(read().draft.content.appointments).toEqual(
      plan.content.appointments
    );
    expect(read().draft.content.fundingSources).toEqual(
      plan.content.fundingSources
    );
  });

  it('blocks saving an incomplete retained salary until it is supplied or the appointment is removed', async () => {
    const plan = createSalaryExample();
    plan.content.appointments[0].monthlySalary = null;
    const user = openWorkspace(plan, false);
    await screen.findByText('Salary needs input');
    expect(screen.getByRole('button', { name: 'Save plan' })).toBeDisabled();
    await user.click(
      screen.getByRole('button', { name: 'Edit appointment for Alex Example' })
    );
    await enter(user, 'CBR (%)', '25');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(
      screen.getByRole('button', {
        name: 'Remove appointment for Alex Example',
      })
    );
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' })
    );
    await user.click(screen.getByRole('button', { name: 'Save plan' }));
    await screen.findByRole('button', { name: '✓ Saved' });
    expect(workspace.server.read().stored!.content.appointments).toEqual([]);
    expect(read().draft.content.fundingSources).toEqual(
      plan.content.fundingSources
    );
  });

  it('waits for new-hire defaults, exposes failure, and uses the returned values after retry', async () => {
    let fail = true;
    const lookups = createAppointmentLookupsExample();
    lookups.appointmentDefaults = {
      cbrRate: 0.27,
      colaMonth: 10,
      colaRate: -0.02,
      fte: 0.75,
    };
    server.use(
      http.get('/api/projections/lookups', () =>
        fail
          ? new HttpResponse(null, { status: 503 })
          : HttpResponse.json(lookups)
      )
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <AppointmentEditor
          onApply={() => ({ ok: true })}
          onClose={() => {}}
          snapshotMonth="2026-01"
        />
      </QueryClientProvider>
    );
    await screen.findByRole('alert');
    expect(screen.queryByLabelText('FTE (%)')).not.toBeInTheDocument();
    fail = false;
    await userEvent.click(
      screen.getByRole('button', { name: 'Retry defaults' })
    );
    expect(await screen.findByLabelText('FTE (%)')).toHaveValue('75');
    expect(screen.getByLabelText('CBR (%)')).toHaveValue('27');
    expect(screen.getByLabelText('Annual adjustment (%)')).toHaveValue('-2');
    expect(screen.getByLabelText('Adjustment month')).toHaveValue('10');
  });

  it('edits a stored appointment without lookup availability and retains typing after a failed background lookup refresh', async () => {
    server.use(
      http.get(
        '/api/projections/lookups',
        () => new HttpResponse(null, { status: 503 })
      )
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const appointment = createSalaryExample().content.appointments[0];
    const ref = createRef<AppointmentEditorHandle>();
    const apply = vi.fn(() => ({ ok: true as const }));
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={client}>
        <AppointmentEditor
          appointment={appointment}
          onApply={apply}
          onClose={() => {}}
          ref={ref}
          snapshotMonth="2026-01"
        />
      </QueryClientProvider>
    );
    expect(screen.getByLabelText('Full-time annual salary')).toHaveValue(
      '120000.00'
    );
    await enter(user, 'FTE (%)', '60');
    await waitFor(() =>
      expect(
        client.getQueryState(projectionLookupsQueryOptions().queryKey)?.status
      ).toBe('error')
    );
    expect(screen.getByLabelText('FTE (%)')).toHaveValue('60');
    expect(ref.current!.read().hasChanges).toBe(true);
    await act(async () => {
      client.setQueryData(
        projectionLookupsQueryOptions().queryKey,
        createAppointmentLookupsExample()
      );
    });
    await enter(user, 'CBR (%)', '28');
    const input = screen.getByLabelText('CBR (%)');
    await act(async () => {
      await client.refetchQueries({
        queryKey: projectionLookupsQueryOptions().queryKey,
      });
    });
    expect(input).toHaveValue('28');
    expect(input).toHaveFocus();
    expect(ref.current!.read().hasChanges).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({ cbrRate: 0.28, fte: 0.6 })
    );
  });
});
