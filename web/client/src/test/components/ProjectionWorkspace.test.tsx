import { createRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { projectionLookupsQueryOptions } from '@/queries/projections.ts';
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
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProjectionPreviewRouter } from '@/dev/projections/router.tsx';
import {
  createSalaryExample,
  createAppointmentLookupsExample,
} from '@/dev/projections/fixture.ts';
import { SALARY_CATEGORY } from '@/lib/piProjection.ts';
import { ProjectionSessionProvider } from '@/components/projections/ProjectionSession.tsx';
import {
  ProjectionWorkspace,
  type ProjectionWorkspaceHandle,
} from '@/components/projections/ProjectionWorkspace.tsx';

afterEach(cleanup);

function openPreview(
  search = '?section=staffing&appointment=101',
  plan = createSalaryExample()
) {
  const history = createMemoryHistory({
    initialEntries: [`/projections-preview.html${search}`],
  });
  const router = createProjectionPreviewRouter({ history, plan });
  render(<RouterProvider router={router} />);
  return { history, router, user: userEvent.setup() };
}

const read = () => window.walterProjectionPreview!.read();
const salaryInput = () =>
  screen.getByRole('textbox', { name: 'Full-time annual salary' });
const editButton = () =>
  screen.getByRole('button', { name: 'Edit appointment for Alex Example' });

describe('projection salary workspace', () => {
  it('starts the outlook at the saved snapshot month while retaining prior spending', async () => {
    const plan = createSalaryExample();
    openPreview('?section=overview&source=1', plan);
    await screen.findByRole('heading', { name: 'Project A by month' });
    const table = screen.getByRole('table');
    expect(
      within(table)
        .getAllByRole('rowheader')
        .map((cell) => cell.textContent)
    ).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
    ]);
    expect(read().draft.fundingSources[0].actuals).toEqual(
      plan.fundingSources[0].actuals
    );
    expect(read().results.rows.every(({ month }) => month >= '2026-01')).toBe(
      true
    );
  });

  it('keeps booked costs visible while salary edits change only the remaining snapshot forecast', async () => {
    const history = createMemoryHistory({
      initialEntries: [
        '/projections-preview.html?example=booked&section=overview&source=1',
      ],
    });
    const router = createProjectionPreviewRouter({
      example: 'booked',
      history,
    });
    render(<RouterProvider router={router} />);
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Project A by month' });
    const january = () => screen.getByRole('row', { name: /^2026-01 / });
    expect(
      within(january())
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
    ).toEqual(['$1,400.00', '$2,100.00', '$24,500.00']);

    await user.click(screen.getByRole('button', { name: 'Staffing' }));
    await user.click(editButton());
    await user.clear(salaryInput());
    await user.type(salaryInput(), '43200');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(read().revision).toBe(1));
    expect(
      read().results.rows.find(
        (row) =>
          row.fundingSourceId === 1 &&
          row.month === '2026-01' &&
          row.expenditureCategory === SALARY_CATEGORY
      )
    ).toMatchObject({
      actualAmount: 1000,
      projectedAmount: 0,
      remaining: 19_000,
    });

    await user.click(screen.getByRole('button', { name: 'Funding outlook' }));
    await screen.findByRole('heading', { name: 'Project A by month' });
    expect(
      within(january())
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
    ).toEqual(['$1,400.00', '$0.00', '$26,600.00']);
    const february = screen.getByRole('row', { name: /^2026-02 / });
    expect(
      within(february)
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
    ).toEqual(['$0.00', '$1,260.00', '$25,340.00']);
    expect(router.state.location.search).toMatchObject({
      example: 'booked',
      source: 1,
    });

    await user.click(screen.getByRole('button', { name: 'Save plan' }));
    await waitFor(() => expect(read().dirty).toBe(false));
    expect(read().draft.fundingSources[0].actuals).toEqual([
      {
        amount: 1000,
        expenditureCategory: SALARY_CATEGORY,
        month: '2026-01-01',
      },
      {
        amount: 400,
        expenditureCategory: '02 - Fringe Benefits',
        month: '2026-01-01',
      },
    ]);
  });

  it('opens and focuses a direct appointment link; Cancel discards typing and Apply commits the same operation', async () => {
    const { user } = openPreview();
    await screen.findByRole('dialog');
    expect(salaryInput()).toHaveFocus();
    expect(read().pendingEditor).toEqual({
      appointmentId: 101,
      hasChanges: false,
      kind: 'appointment',
      validationMessage: null,
    });
    await user.clear(salaryInput());
    await user.type(salaryInput(), '132000');
    expect(read().draft.appointments[0].monthlySalary).toBe(10_000);
    expect(read().pendingEditor?.hasChanges).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(read()).toMatchObject({
      dirty: false,
      pendingEditor: null,
      revision: 0,
    });
    expect(editButton()).toHaveFocus();

    await user.click(editButton());
    expect(salaryInput()).toHaveValue('120000.00');
    await user.clear(salaryInput());
    await user.type(salaryInput(), '132000');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(read().revision).toBe(1));
    expect(read().draft.appointments[0].monthlySalary).toBe(11_000);
    expect(
      read().results.rows.every((row) => row.projectedAmount === 2750)
    ).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes');
    expect(editButton()).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Funding outlook' }));
    expect(await screen.findByText('Projected shortfall')).toBeInTheDocument();
    expect(screen.getByText('-$500.00')).toBeInTheDocument();
  });

  it('rejects blank and invalid annual input, accepts zero, and keeps no-op precision', async () => {
    const plan = createSalaryExample();
    plan.appointments[0].monthlySalary = 10_000.123_45;
    const { user } = openPreview(undefined, plan);
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(read().draft.appointments[0].monthlySalary).toBe(10_000.123_45);
    expect(read().revision).toBe(0);

    await user.click(editButton());
    await user.clear(salaryInput());
    await user.type(salaryInput(), '0120001.48');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(read().draft.appointments[0].monthlySalary).toBe(10_000.123_45);
    expect(read().revision).toBe(0);

    await user.click(editButton());
    for (const value of ['', '-1', 'abc', '120000.001']) {
      await user.clear(salaryInput());
      if (value) {
        await user.type(salaryInput(), value);
      }
      expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
      expect(salaryInput()).toHaveAttribute('aria-invalid', 'true');
      expect(read().pendingEditor?.validationMessage).toBeTruthy();
      await user.keyboard('{Enter}');
      expect(read().revision).toBe(0);
    }
    await user.clear(salaryInput());
    await user.type(salaryInput(), '0');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(read().revision).toBe(1));
    expect(read().draft.appointments[0].monthlySalary).toBe(0);
  });

  it('preserves committed salary and source location through Back/Forward and discards a closed editor buffer', async () => {
    const { history, user } = openPreview('?section=overview&source=2');
    await screen.findByRole('heading', { name: 'Project B by month' });
    await user.click(screen.getByRole('button', { name: 'Staffing' }));
    await user.click(editButton());
    await user.clear(salaryInput());
    await user.type(salaryInput(), '132000');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(read().revision).toBe(1));
    await user.click(editButton());
    await user.clear(salaryInput());
    await user.type(salaryInput(), '144000');
    await act(async () => history.back());
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(read()).toMatchObject({
      location: { fundingSourceId: 2, section: 'staffing' },
      revision: 1,
    });
    await act(async () => history.forward());
    await screen.findByRole('dialog');
    expect(salaryInput()).toHaveValue('132000.00');
    expect(read().pendingEditor?.hasChanges).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Funding outlook' }));
    expect(
      await screen.findByRole('heading', { name: 'Project B by month' })
    ).toHaveFocus();
    expect(read().draft.appointments[0].monthlySalary).toBe(11_000);
    await act(async () => history.back());
    await waitFor(() => expect(read().location.section).toBe('staffing'));
    await act(async () => history.forward());
    await screen.findByRole('heading', { name: 'Project B by month' });
    expect(read().revision).toBe(1);
  });

  it('retains committed draft when a workspace view remounts within its plan session', async () => {
    const user = userEvent.setup();
    const plan = createSalaryExample();
    const ref = createRef<ProjectionWorkspaceHandle>();
    const onNavigate = vi.fn();
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      projectionLookupsQueryOptions().queryKey,
      createAppointmentLookupsExample()
    );
    const view = (key: string, search: Record<string, unknown>) => (
      <QueryClientProvider client={queryClient}>
        <ProjectionSessionProvider initialPlan={plan}>
          <ProjectionWorkspace
            key={key}
            onNavigate={onNavigate}
            ref={ref}
            search={search}
          />
        </ProjectionSessionProvider>
      </QueryClientProvider>
    );
    const rendered = render(
      view('first', { appointment: 101, section: 'staffing' })
    );
    await user.clear(salaryInput());
    await user.type(salaryInput(), '132000');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    rendered.rerender(view('second', { section: 'overview', source: 1 }));
    expect(ref.current!.read()).toMatchObject({ dirty: true, revision: 1 });
    expect(ref.current!.read().draft.appointments[0].monthlySalary).toBe(
      11_000
    );
    expect(
      screen.getByRole('heading', { name: 'Project A by month' })
    ).toBeInTheDocument();
  });

  it('treats Escape cancellation like Cancel and restores the appointment control focus', async () => {
    openPreview();
    const dialog = await screen.findByRole('dialog');
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(read()).toMatchObject({ dirty: false, revision: 0 });
    expect(editButton()).toHaveFocus();
  });

  it.each([
    ['?section=unknown', 'This plan section does not exist.'],
    [
      '?section=staffing&appointment=999',
      'Appointment 999 is not in this plan.',
    ],
    [
      '?section=staffing&appointment=abc',
      'The appointment target is malformed.',
    ],
    ['?section=overview&source=999', 'Funding source 999 is not in this plan.'],
    ['?section=overview&source=-2', 'The source target is malformed.'],
    [
      '?section=overview&appointment=101',
      'An appointment editor must be opened in Staffing.',
    ],
  ])(
    'handles an invalid direct location %s explicitly',
    async (search, message) => {
      const { user } = openPreview(search);
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(read().revision).toBe(0);
      await user.click(
        screen.getByRole('button', { name: 'Open plan overview' })
      );
      await waitFor(() =>
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      );
      expect(read().location).toEqual({
        appointmentId: null,
        fundingMonth: null,
        fundingSourceId: null,
        issues: [],
        section: 'overview',
      });
    }
  );
});
