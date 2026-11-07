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
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import {
  createBrowserHistory,
  createMemoryHistory,
  RouterProvider,
  type RouterHistory,
} from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectionSessionProvider } from '@/components/projections/ProjectionSession.tsx';
import {
  ProjectionWorkspace,
  type ProjectionWorkspaceHandle,
} from '@/components/projections/ProjectionWorkspace.tsx';
import { createSalaryExample } from '@/dev/projections/fixture.ts';
import { createProjectionPreviewRouter } from '@/dev/projections/router.tsx';
import { createProjectionPreviewServer } from '@/dev/projections/server.ts';
import type { Projection } from '@/queries/projections.ts';

const histories: RouterHistory[] = [];

afterEach(() => {
  cleanup();
  histories.splice(0).forEach((history) => history.destroy());
  vi.restoreAllMocks();
});

function example() {
  return {
    ...createSalaryExample(),
    seededAt: '2026-01-01T00:00:00.7654321Z',
    updatedAt: '2026-02-01T00:00:00.1234567Z',
  };
}

function openPreview({ browserHistory = false } = {}) {
  const plan = example();
  const server = createProjectionPreviewServer(plan);
  const path = '/projections-preview.html?section=staffing&project=2';
  if (browserHistory) {
    window.history.replaceState(null, '', path);
  }
  // Memory history does not register blockers or beforeunload handlers.
  const history = browserHistory
    ? createBrowserHistory({ window })
    : createMemoryHistory({ initialEntries: [path] });
  histories.push(history);
  const router = createProjectionPreviewRouter({ history, plan, server });
  render(<RouterProvider router={router} />);
  return { history, plan, router, server, user: userEvent.setup() };
}

const read = () => window.walterProjectionPreview!.read();
const saveButton = () => screen.getByRole('button', { name: 'Save plan' });

async function applySalary(
  user: ReturnType<typeof userEvent.setup>,
  annual: string
) {
  await user.click(
    await screen.findByRole('button', { name: 'Edit salary for Alex Example' })
  );
  const input = screen.getByRole('textbox', {
    name: 'Full-time annual salary',
  });
  await user.clear(input);
  await user.type(input, annual);
  await user.click(screen.getByRole('button', { name: 'Apply' }));
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: 'Edit salary for Alex Example' })
    ).not.toBeInTheDocument()
  );
}

describe('projection saving through the workspace', () => {
  it('captures exact tokens once, keeps newer edits during a delayed save, and reopens the saved plan', async () => {
    const { plan, server, user } = openPreview();
    await applySalary(user, '132000');
    await user.click(
      screen.getByRole('checkbox', { name: 'Hold save requests' })
    );
    await user.dblClick(saveButton());
    await waitFor(() => expect(server.read().requests).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(read().persistence).toMatchObject({
      conflict: null,
      saveStatus: 'saving',
      saving: true,
    });
    expect(server.read().requests[0]).toMatchObject({
      expectedSeededAt: plan.seededAt,
      expectedUpdatedAt: plan.updatedAt,
    });
    expect(server.read().stored!.jobs[0].monthlySalary).toBe(10_000);

    await applySalary(user, '140000');
    await user.click(
      screen.getByRole('button', { name: 'Finish pending save' })
    );
    await waitFor(() => expect(saveButton()).toBeEnabled());
    expect(server.read().stored!.jobs[0].monthlySalary).toBe(11_000);
    expect(read().draft.jobs[0].monthlySalary).toBe(140_000 / 12);
    expect(read().dirty).toBe(true);
    expect(
      screen.getByText(
        'Submitted changes were saved. Newer edits are still unsaved.'
      )
    ).toBeInTheDocument();
    const acknowledgedVersion = server.read().stored!.updatedAt;

    await user.click(
      screen.getByRole('checkbox', { name: 'Hold save requests' })
    );
    await user.click(saveButton());
    expect(
      await screen.findByRole('button', { name: '✓ Saved' })
    ).toBeDisabled();
    expect(server.read().requests[1].expectedUpdatedAt).toBe(
      acknowledgedVersion
    );
    expect(server.read().requests[1].expectedSeededAt).toBe(plan.seededAt);
    expect(read().dirty).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Leave preview' }));
    await screen.findByRole('heading', { name: 'Outside the plan' });
    await user.click(
      screen.getByRole('button', { name: 'Return to saved plan' })
    );
    await screen.findByRole('button', { name: 'Edit salary for Alex Example' });
    expect(read().draft.jobs[0].monthlySalary).toBe(140_000 / 12);
    expect(read().dirty).toBe(false);
  });

  it.each(['failure', 'lost-response'] as const)(
    'keeps failed %s saves unconfirmed without automatic reads or retries',
    async (outcome) => {
      const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { server, user } = openPreview();
      await applySalary(user, '132000');
      act(() => server.setOutcome(outcome));
      await user.click(saveButton());
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Save was not confirmed'
      );
      expect(read().draft.jobs[0].monthlySalary).toBe(11_000);
      expect(read().dirty).toBe(true);
      expect(
        screen.queryByRole('button', { name: '✓ Saved' })
      ).not.toBeInTheDocument();
      expect(server.read().requests).toHaveLength(1);
      expect(server.read().reloads).toBe(0);
      expect(server.read().stored!.jobs[0].monthlySalary).toBe(
        outcome === 'failure' ? 10_000 : 11_000
      );
      expect(logger).toHaveBeenCalledWith('Projection request failed', {
        operation: 'save',
        status: null,
      });

      await user.click(saveButton());
      if (outcome === 'failure') {
        await screen.findByRole('button', { name: '✓ Saved' });
        expect(read().dirty).toBe(false);
      } else {
        await screen.findByRole('dialog', { name: 'This plan has changed' });
        expect(read().dirty).toBe(true);
      }
      expect(server.read().requests).toHaveLength(2);
      expect(server.read().reloads).toBe(0);
    }
  );

  it('closes a conflict without losing work and overwrites with the current whole draft', async () => {
    const { plan, server, user } = openPreview();
    await applySalary(user, '132000');
    act(() => server.editRemotely());
    await user.click(saveButton());
    await screen.findByRole('dialog', { name: 'This plan has changed' });
    expect(read().persistence).toMatchObject({
      conflict: 'conflict',
      conflictOpen: true,
      saving: false,
    });
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(read().draft.jobs[0].monthlySalary).toBe(11_000);
    await applySalary(user, '144000');
    await user.click(saveButton());
    await screen.findByRole('dialog', { name: 'This plan has changed' });
    expect(server.read().requests).toHaveLength(1);
    act(() => server.editRemotely());
    await user.click(screen.getByRole('button', { name: 'Overwrite' }));
    await screen.findByRole('button', { name: '✓ Saved' });
    expect(server.read().requests).toHaveLength(2);
    expect(server.read().requests[1]).toMatchObject({
      expectedUpdatedAt: plan.updatedAt,
      overwrite: true,
    });
    expect(server.read().stored!.name).toBe(plan.name);
    expect(server.read().stored!.jobs[0].monthlySalary).toBe(12_000);
    expect(server.read().reloads).toBe(0);
  });

  it.each(['failure', 'lost-response'] as const)(
    'allows explicit retry after %s when newer edits return to the original baseline',
    async (outcome) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { router, server, user } = openPreview({ browserHistory: true });
      await applySalary(user, '132000');
      act(() => {
        server.setOutcome(outcome);
        server.setHold(true);
      });
      await user.click(saveButton());
      await screen.findByRole('button', { name: 'Saving…' });
      await applySalary(user, '120000');
      expect(read().dirty).toBe(false);
      act(() => server.finishNextSave());
      await screen.findByRole('alert');
      expect(saveButton()).toBeEnabled();
      expect(server.read().requests).toHaveLength(1);
      expect(server.read().reloads).toBe(0);
      const unload = new Event('beforeunload', { cancelable: true });
      fireEvent(window, unload);
      expect(unload.defaultPrevented).toBe(true);
      act(() => {
        void router.navigate({ to: '/projections-preview-away.html' });
      });
      await screen.findByRole('dialog', { name: 'Leave this plan?' });
      await user.click(screen.getByRole('button', { name: 'Stay' }));

      act(() => server.setHold(false));
      await user.click(saveButton());
      if (outcome === 'lost-response') {
        await screen.findByRole('dialog', { name: 'This plan has changed' });
        await user.click(screen.getByRole('button', { name: 'Overwrite' }));
      }
      await screen.findByRole('button', { name: '✓ Saved' });
      expect(read().draft.jobs[0].monthlySalary).toBe(10_000);
      expect(server.read().stored!.jobs[0].monthlySalary).toBe(10_000);
      expect(server.read().requests[1].jobs[0].monthlySalary).toBe(10_000);
      expect(server.read().reloads).toBe(0);
    }
  );

  it('retains confirmed overwrite intent across an explicit retry after a transient failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { server, user } = openPreview();
    await applySalary(user, '132000');
    act(() => server.editRemotely());
    await user.click(saveButton());
    await screen.findByRole('dialog', { name: 'This plan has changed' });
    act(() => server.setOutcome('failure'));
    await user.click(screen.getByRole('button', { name: 'Overwrite' }));
    await screen.findByRole('alert');
    await applySalary(user, '144000');
    await user.click(saveButton());
    await screen.findByRole('button', { name: '✓ Saved' });
    expect(server.read().requests.map((request) => request.overwrite)).toEqual([
      false,
      true,
      true,
    ]);
    expect(server.read().stored!.jobs[0].monthlySalary).toBe(12_000);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('discards by fetching the latest document and retaining a valid section and project', async () => {
    const { server, user } = openPreview();
    await applySalary(user, '132000');
    act(() => server.editRemotely());
    await user.click(saveButton());
    await screen.findByRole('dialog', { name: 'This plan has changed' });
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(read().dirty).toBe(false));
    expect(server.read().reloads).toBe(1);
    expect(read().draft).toEqual(server.read().stored);
    expect(read().location).toMatchObject({
      projectId: 2,
      section: 'staffing',
    });
  });

  it.each(['reset', 'delete'] as const)(
    'blocks overwrite after a remote %s and preserves the local draft',
    async (change) => {
      const { server, user } = openPreview();
      await applySalary(user, '132000');
      act(() =>
        change === 'reset' ? server.resetRemotely() : server.deleteRemotely()
      );
      await user.click(saveButton());
      await screen.findByRole('dialog', {
        name:
          change === 'reset' ? 'This plan was reset' : 'This plan was deleted',
      });
      expect(
        screen.queryByRole('button', { name: 'Overwrite' })
      ).not.toBeInTheDocument();
      expect(read().draft.jobs[0].monthlySalary).toBe(11_000);
      expect(read().dirty).toBe(true);
      expect(server.read().requests).toHaveLength(1);
    }
  );

  it('allows same-plan navigation and protects departure from unapplied input with Stay and Discard', async () => {
    const { router, user } = openPreview({ browserHistory: true });
    await screen.findByRole('button', { name: 'Edit salary for Alex Example' });
    await user.click(screen.getByRole('button', { name: 'Project outlook' }));
    expect(
      await screen.findByRole('heading', { name: 'Project B by month' })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Staffing' }));
    await user.click(
      screen.getByRole('button', { name: 'Edit salary for Alex Example' })
    );
    const input = screen.getByRole('textbox', {
      name: 'Full-time annual salary',
    });
    await user.clear(input);
    await user.type(input, '132000');
    const unload = new Event('beforeunload', { cancelable: true });
    fireEvent(window, unload);
    expect(unload.defaultPrevented).toBe(true);

    act(() => {
      void router.navigate({ to: '/projections-preview-away.html' });
    });
    await screen.findByRole('dialog', { name: 'Leave this plan?' });
    await user.click(screen.getByRole('button', { name: 'Stay' }));
    expect(input).toHaveValue('132000');
    expect(read().dirty).toBe(false);
    act(() => {
      void router.navigate({ to: '/projections-preview-away.html' });
    });
    await screen.findByRole('dialog', { name: 'Leave this plan?' });
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(
      await screen.findByRole('heading', { name: 'Outside the plan' })
    ).toBeInTheDocument();
  });

  it('warns that a pending save may finish after leaving and permits the confirmed departure', async () => {
    const { server, user } = openPreview({ browserHistory: true });
    await applySalary(user, '132000');
    act(() => server.setHold(true));
    await user.click(saveButton());
    await screen.findByRole('button', { name: 'Saving…' });
    await user.click(screen.getByRole('button', { name: 'Leave preview' }));
    expect(
      await screen.findByRole('dialog', { name: 'Leave while saving?' })
    ).toHaveTextContent(/may still complete/i);
    await user.click(screen.getByRole('button', { name: 'Stay' }));
    expect(read().draft.jobs[0].monthlySalary).toBe(11_000);
    await user.click(screen.getByRole('button', { name: 'Leave preview' }));
    await user.click(
      await screen.findByRole('button', { name: 'Leave anyway' })
    );
    await screen.findByRole('heading', { name: 'Outside the plan' });
    await act(async () => server.finishNextSave());
    expect(server.read().stored!.jobs[0].monthlySalary).toBe(11_000);
    await user.click(
      screen.getByRole('button', { name: 'Return to saved plan' })
    );
    await screen.findByRole('button', { name: 'Edit salary for Alex Example' });
    expect(read().dirty).toBe(false);
    expect(read().draft.jobs[0].monthlySalary).toBe(11_000);
  });

  it('does not replace an active draft or its save token when Query cache refreshes', async () => {
    const plan = example();
    const server = createProjectionPreviewServer(plan);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const ref = createRef<ProjectionWorkspaceHandle>();
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    function CachedWorkspace({ editing }: { editing: boolean }) {
      const { data } = useQuery({
        enabled: false,
        initialData: plan,
        queryFn: server.reload,
        queryKey: ['projections', plan.id],
      });
      return (
        <ProjectionSessionProvider initialPlan={data} persistence={server}>
          <ProjectionWorkspace
            onNavigate={onNavigate}
            ref={ref}
            search={{ ...(editing ? { job: 101 } : {}), section: 'staffing' }}
          />
        </ProjectionSessionProvider>
      );
    }
    const view = (editing: boolean) => (
      <QueryClientProvider client={client}>
        <CachedWorkspace editing={editing} />
      </QueryClientProvider>
    );
    const rendered = render(view(true));
    const input = screen.getByRole('textbox', {
      name: 'Full-time annual salary',
    });
    await user.clear(input);
    await user.type(input, '132000');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    rendered.rerender(view(false));
    act(() => {
      server.editRemotely();
      client.setQueryData<Projection>(
        ['projections', plan.id],
        server.read().stored!
      );
    });
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: plan.name })
      ).toBeInTheDocument()
    );
    expect(ref.current!.read().draft.jobs[0].monthlySalary).toBe(11_000);
    expect(ref.current!.read().dirty).toBe(true);
    await user.click(saveButton());
    await screen.findByRole('dialog', { name: 'This plan has changed' });
    expect(server.read().requests[0].expectedUpdatedAt).toBe(plan.updatedAt);
    client.clear();
  });
});
