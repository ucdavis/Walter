import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createBrowserHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  createSalaryExample,
  createAppointmentLookupsExample,
} from '@/dev/projections/fixture.ts';
import type {
  Projection,
  SaveProjectionRequest,
} from '@/queries/projections.ts';
import { server } from '@/test/mswUtils.ts';
import { routeTree } from '@/routeTree.gen.ts';

const salaryInput = () =>
  screen.getByRole('textbox', { name: 'Full-time annual salary' });

function renderPlan(initialPath: string) {
  window.history.replaceState(null, '', initialPath);
  // Memory history does not implement blockers; this scenario exercises the real departure dialog.
  const history = createBrowserHistory();
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  const router = createRouter({
    context: { queryClient },
    history,
    routeTree,
  });
  const { unmount } = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return {
    cleanup: () => {
      unmount();
      history.destroy();
      queryClient.clear();
      window.history.replaceState(null, '', '/');
    },
    queryClient,
    router,
  };
}

function handlePlans(stored: Map<number, Projection>) {
  server.use(
    http.get('/api/projections/lookups', () =>
      HttpResponse.json(createAppointmentLookupsExample())
    ),
    http.get('/api/user/me', () =>
      HttpResponse.json({
        email: 'preview@example.com',
        employeeId: 'SYNTHETIC',
        iamId: 'IAM-PREVIEW',
        id: 'preview-user',
        isEmulating: false,
        kerberos: 'preview',
        name: 'Preview User',
        roles: [],
      })
    ),
    http.get('/api/projections/by-iam/:iamId', () =>
      HttpResponse.json([...stored.values()])
    ),
    http.get('/api/projections/:id', ({ params }) =>
      HttpResponse.json(stored.get(Number(params.id)))
    )
  );
}

describe('switching saved projection plans', () => {
  it('keeps a late save for the previous plan out of the new plan and its next save', async () => {
    const first = { ...createSalaryExample(), name: 'First plan' };
    const second = { ...createSalaryExample(), id: 2, name: 'Second plan' };
    second.content.appointments[0].name = 'Blair Example';
    second.content.appointments[0].monthlySalary = 15_000;
    second.updatedAt = '2026-01-01T00:00:00.0000002Z';
    const stored = new Map([
      [first.id, first],
      [second.id, second],
    ]);
    const requests: { body: SaveProjectionRequest; id: number }[] = [];
    let finishFirst!: () => void;
    const firstResponse = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const firstSavedAt = '2026-01-02T00:00:00.1234567Z';
    handlePlans(stored);
    server.use(
      http.put('/api/projections/:id', async ({ params, request }) => {
        const id = Number(params.id);
        const body = (await request.json()) as SaveProjectionRequest;
        requests.push({ body, id });
        if (id === first.id) {
          await firstResponse;
        }
        const saved: Projection = {
          ...stored.get(id)!,
          content: body.content,
          name: body.name,
          updatedAt:
            id === first.id ? firstSavedAt : '2026-01-03T00:00:00.7654321Z',
          updatedBy: 'preview-user',
        };
        stored.set(id, saved);
        return HttpResponse.json(saved);
      })
    );
    const user = userEvent.setup();
    const route = renderPlan(
      `/projections/IAM-PREVIEW/${first.id}?section=staffing&appointment=101`
    );
    try {
      await screen.findByRole('dialog');
      await screen.findByRole('textbox', { name: 'Full-time annual salary' });
      await user.clear(salaryInput());
      await user.type(salaryInput(), '132000');
      await user.click(screen.getByRole('button', { name: 'Apply' }));
      await user.click(screen.getByRole('button', { name: 'Save plan' }));
      await waitFor(() => expect(requests).toHaveLength(1));

      await act(async () => {
        void route.router.navigate({
          params: { iamId: 'IAM-PREVIEW', projectionId: String(second.id) },
          search: { section: 'staffing' },
          to: '/projections/$iamId/$projectionId',
        });
      });
      await screen.findByRole('dialog', { name: 'Leave while saving?' });
      await user.click(screen.getByRole('button', { name: 'Leave anyway' }));
      await screen.findByRole('heading', { name: 'Second plan' });
      expect(
        screen.getByText('$180,000.00 per year at full time')
      ).toBeInTheDocument();

      await act(async () => finishFirst());
      await waitFor(() =>
        expect(
          route.queryClient.getQueryData<Projection>(['projections', first.id])
            ?.updatedAt
        ).toBe(firstSavedAt)
      );
      expect(
        route.queryClient.getQueryData<Projection>(['projections', second.id])
      ).toMatchObject({
        content: {
          appointments: [{ monthlySalary: 15_000, name: 'Blair Example' }],
        },
        id: second.id,
        name: 'Second plan',
        updatedAt: second.updatedAt,
      });
      expect(
        screen.getByRole('heading', { name: 'Second plan' })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: 'First plan' })
      ).not.toBeInTheDocument();

      await user.click(
        screen.getByRole('button', {
          name: 'Edit appointment for Blair Example',
        })
      );
      await user.clear(salaryInput());
      await user.type(salaryInput(), '192000');
      await user.click(screen.getByRole('button', { name: 'Apply' }));
      await user.click(screen.getByRole('button', { name: 'Save plan' }));
      await waitFor(() => expect(requests).toHaveLength(2));
      expect(requests[1]).toMatchObject({
        body: {
          content: {
            appointments: [{ monthlySalary: 16_000, name: 'Blair Example' }],
          },
          expectedSeededAt: second.seededAt,
          expectedUpdatedAt: second.updatedAt,
          name: 'Second plan',
          overwrite: false,
        },
        id: second.id,
      });
      await screen.findByRole('button', { name: '✓ Saved' });
    } finally {
      finishFirst();
      route.cleanup();
    }
  });

  it('does not navigate the next plan when a previous discard reload finishes after departure', async () => {
    const first = { ...createSalaryExample(), name: 'First plan' };
    const second = { ...createSalaryExample(), id: 2, name: 'Second plan' };
    const stored = new Map([
      [first.id, first],
      [second.id, second],
    ]);
    handlePlans(stored);
    server.use(
      http.put('/api/projections/:id', () =>
        HttpResponse.json({ code: 'conflict' }, { status: 409 })
      )
    );
    const user = userEvent.setup();
    const route = renderPlan(
      `/projections/IAM-PREVIEW/${first.id}?section=staffing&source=2&appointment=101`
    );
    let finishReload!: () => void;
    const delayedReload = new Promise<void>((resolve) => {
      finishReload = resolve;
    });
    let reloadStarted = false;
    let responseReturned!: () => void;
    const reloadReturned = new Promise<void>((resolve) => {
      responseReturned = resolve;
    });
    try {
      await screen.findByRole('dialog');
      await screen.findByRole('textbox', { name: 'Full-time annual salary' });
      await user.clear(salaryInput());
      await user.type(salaryInput(), '132000');
      await user.click(screen.getByRole('button', { name: 'Apply' }));
      await user.click(screen.getByRole('button', { name: 'Save plan' }));
      const conflict = await screen.findByRole('dialog', {
        name: 'This plan has changed',
      });
      const latest = structuredClone(first);
      latest.content.fundingSources = latest.content.fundingSources.filter(
        ({ id }) => id !== 2
      );
      latest.updatedAt = '2026-01-02T00:00:00.1234567Z';
      server.use(
        http.get(`/api/projections/${first.id}`, async () => {
          reloadStarted = true;
          await delayedReload;
          responseReturned();
          return HttpResponse.json(latest);
        })
      );
      await user.click(
        within(conflict).getByRole('button', { name: 'Discard' })
      );
      await waitFor(() => expect(reloadStarted).toBe(true));

      await act(async () => {
        void route.router.navigate({
          params: { iamId: 'IAM-PREVIEW', projectionId: String(second.id) },
          search: { section: 'staffing', source: 2 },
          to: '/projections/$iamId/$projectionId',
        });
      });
      const departure = await screen.findByRole('dialog', {
        name: 'Leave this plan?',
      });
      await user.click(
        within(departure).getByRole('button', { name: 'Discard' })
      );
      await screen.findByRole('heading', { name: 'Second plan' });

      await act(async () => {
        finishReload();
        await reloadReturned;
      });
      expect(route.router.state.location.pathname).toBe(
        `/projections/IAM-PREVIEW/${second.id}`
      );
      expect(route.router.state.location.search).toMatchObject({
        section: 'staffing',
        source: 2,
      });
      expect(
        screen.getByRole('heading', { name: 'Second plan' })
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Staffing' })).toHaveAttribute(
        'aria-current',
        'page'
      );
    } finally {
      finishReload();
      route.cleanup();
    }
  });
});
