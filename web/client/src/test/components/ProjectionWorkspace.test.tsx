import { createRef } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProjectionPreviewRouter } from '@/dev/projections/router.tsx';
import { createSalaryExample } from '@/dev/projections/fixture.ts';
import { ProjectionSessionProvider } from '@/components/projections/ProjectionSession.tsx';
import {
  ProjectionWorkspace,
  type ProjectionWorkspaceHandle,
} from '@/components/projections/ProjectionWorkspace.tsx';

afterEach(cleanup);

function openPreview(
  search = '?section=staffing&job=101',
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
  screen.getByRole('button', { name: 'Edit salary for Alex Example' });

describe('projection salary workspace', () => {
  it('opens and focuses a direct job link; Cancel discards typing and Apply commits the same operation', async () => {
    const { user } = openPreview();
    await screen.findByRole('dialog');
    expect(salaryInput()).toHaveFocus();
    expect(read().pendingEditor).toEqual({
      hasChanges: false,
      jobId: 101,
      validationMessage: null,
    });
    await user.clear(salaryInput());
    await user.type(salaryInput(), '132000');
    expect(read().draft.jobs[0].monthlySalary).toBe(10_000);
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
    expect(read().draft.jobs[0].monthlySalary).toBe(11_000);
    expect(
      read()
        .results.rows.filter((row) => row.kind !== 'actual')
        .every((row) => row.projectedAmount === 2750)
    ).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes');
    expect(editButton()).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Project outlook' }));
    expect(await screen.findByText('Projected shortfall')).toBeInTheDocument();
    expect(screen.getByText('-$500.00')).toBeInTheDocument();
  });

  it('rejects blank and invalid annual input, accepts zero, and keeps no-op precision', async () => {
    const plan = createSalaryExample();
    plan.jobs[0].monthlySalary = 10_000.123_45;
    const { user } = openPreview(undefined, plan);
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(read().draft.jobs[0].monthlySalary).toBe(10_000.123_45);
    expect(read().revision).toBe(0);

    await user.click(editButton());
    await user.clear(salaryInput());
    await user.type(salaryInput(), '0120001.48');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(read().draft.jobs[0].monthlySalary).toBe(10_000.123_45);
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
    expect(read().draft.jobs[0].monthlySalary).toBe(0);
  });

  it('preserves committed salary and project location through Back/Forward and discards a closed editor buffer', async () => {
    const { history, user } = openPreview('?section=overview&project=2');
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
      location: { projectId: 2, section: 'staffing' },
      revision: 1,
    });
    await act(async () => history.forward());
    await screen.findByRole('dialog');
    expect(salaryInput()).toHaveValue('132000.00');
    expect(read().pendingEditor?.hasChanges).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Project outlook' }));
    expect(
      await screen.findByRole('heading', { name: 'Project B by month' })
    ).toHaveFocus();
    expect(read().draft.jobs[0].monthlySalary).toBe(11_000);
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
    const view = (key: string, search: Record<string, unknown>) => (
      <ProjectionSessionProvider initialPlan={plan}>
        <ProjectionWorkspace
          key={key}
          onNavigate={onNavigate}
          ref={ref}
          search={search}
        />
      </ProjectionSessionProvider>
    );
    const rendered = render(view('first', { job: 101, section: 'staffing' }));
    await user.clear(salaryInput());
    await user.type(salaryInput(), '132000');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    rendered.rerender(view('second', { project: 1, section: 'overview' }));
    expect(ref.current!.read()).toMatchObject({ dirty: true, revision: 1 });
    expect(ref.current!.read().draft.jobs[0].monthlySalary).toBe(11_000);
    expect(
      screen.getByRole('heading', { name: 'Project A by month' })
    ).toBeInTheDocument();
  });

  it('treats Escape cancellation like Cancel and restores the job control focus', async () => {
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
    ['?section=staffing&job=999', 'Job 999 is not in this plan.'],
    ['?section=staffing&job=abc', 'The job target is malformed.'],
    ['?section=overview&project=999', 'Project 999 is not in this plan.'],
    ['?section=overview&project=-2', 'The project target is malformed.'],
    [
      '?section=overview&job=101',
      'A salary editor must be opened in Staffing.',
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
        issues: [],
        jobId: null,
        projectId: null,
        section: 'overview',
      });
    }
  );
});
