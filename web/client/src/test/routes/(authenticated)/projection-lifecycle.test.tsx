import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createBrowserHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { createSalaryExample } from '@/dev/projections/fixture.ts';
import type {
  CreateProjectionDraftRequest,
  DuplicateProjectionRequest,
  Projection,
  SaveProjectionRequest,
} from '@/queries/projections.ts';
import { routeTree } from '@/routeTree.gen.ts';
import { server } from '@/test/mswUtils.ts';

const portfolioPath = '/projections/IAM-PREVIEW';
const createUrl = '/api/projections/by-iam/IAM-PREVIEW';

function renderPlans() {
  window.history.replaceState(null, '', portfolioPath);
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

function handleLifecycle(plans: Projection[] = []) {
  const seed = {
    ...createSalaryExample(),
    id: 0,
    seededAt: '2026-01-01T00:00:00.1234567Z',
  };
  const stored = new Map(plans.map((plan) => [plan.id, structuredClone(plan)]));
  const keys = new Map<string, number>();
  const creates: CreateProjectionDraftRequest[] = [];
  const duplicates: DuplicateProjectionRequest[] = [];
  const updates: SaveProjectionRequest[] = [];
  let seedReads = 0;
  let nextId = 71;
  const create = (body: CreateProjectionDraftRequest) => {
    creates.push(structuredClone(body));
    const existing = keys.get(body.creationKey);
    if (existing) {
      return stored.get(existing)!;
    }
    const saved: Projection = {
      ...seed,
      ...structuredClone(body.draft),
      createdAt: '2026-02-01T00:00:00.0000001Z',
      createdBy: 'preview',
      historyMonths: body.historyMonths,
      id: nextId++,
      name: body.name,
      updatedAt: '2026-02-01T00:00:00.0000001Z',
      updatedBy: 'preview',
    };
    keys.set(body.creationKey, saved.id);
    stored.set(saved.id, saved);
    return saved;
  };
  const duplicate = (id: number, body: DuplicateProjectionRequest) => {
    duplicates.push(structuredClone(body));
    return create({
      creationKey: body.creationKey,
      draft: {
        jobs: stored.get(id)!.jobs,
        projects: stored.get(id)!.projects,
        seededAt: stored.get(id)!.seededAt,
      },
      historyMonths: stored.get(id)!.historyMonths,
      name: body.name,
    });
  };
  server.use(
    http.get('/api/user/me', () =>
      HttpResponse.json({
        email: 'preview@example.com',
        employeeId: seed.piEmployeeId,
        iamId: 'IAM-PREVIEW',
        id: 'preview-user',
        isEmulating: false,
        kerberos: 'preview',
        name: 'Preview User',
        roles: [],
      })
    ),
    http.get(createUrl, () => HttpResponse.json([...stored.values()])),
    http.get(createUrl + '/seed', ({ request }) => {
      seedReads++;
      return HttpResponse.json({
        ...seed,
        historyMonths: Number(
          new URL(request.url).searchParams.get('historyMonths') ?? 3
        ),
      });
    }),
    http.post(createUrl, async ({ request }) =>
      HttpResponse.json(
        create((await request.json()) as CreateProjectionDraftRequest)
      )
    ),
    http.post('/api/projections/:id/duplicate', async ({ params, request }) =>
      HttpResponse.json(
        duplicate(
          Number(params.id),
          (await request.json()) as DuplicateProjectionRequest
        )
      )
    ),
    http.get('/api/projections/:id', ({ params }) =>
      HttpResponse.json(stored.get(Number(params.id)))
    ),
    http.put('/api/projections/:id', async ({ params, request }) => {
      const body = (await request.json()) as SaveProjectionRequest;
      updates.push(body);
      const current = stored.get(Number(params.id))!;
      const saved = {
        ...current,
        historyMonths: body.historyMonths,
        jobs: body.jobs,
        name: body.name,
        projects: body.projects,
        updatedAt: '2026-02-02T00:00:00.0000002Z',
      };
      stored.set(saved.id, saved);
      return HttpResponse.json(saved);
    })
  );
  return {
    create,
    creates,
    duplicate,
    duplicates,
    seed,
    seedReads: () => seedReads,
    stored,
    updates,
  };
}

async function startWizard(
  user: ReturnType<typeof userEvent.setup>,
  name = 'Reviewed plan'
) {
  await user.click(await screen.findByRole('button', { name: 'New plan' }));
  await user.clear(screen.getByRole('textbox', { name: 'Plan name' }));
  await user.type(screen.getByRole('textbox', { name: 'Plan name' }), name);
}

async function reviewWizard(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByRole('button', { name: 'Edit salary for Alex Example' });
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByRole('button', { name: 'Create plan & open workspace' });
}

describe('projection creation and copies', () => {
  it('saves the reviewed wizard snapshot before opening its saved workspace and then uses normal saves', async () => {
    const api = handleLifecycle();
    const route = renderPlans();
    const user = userEvent.setup();
    try {
      await startWizard(user);
      await user.selectOptions(
        screen.getByRole('combobox', { name: 'Averaging window' }),
        '6'
      );
      expect(api.creates).toHaveLength(0);
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.click(
        await screen.findByRole('button', {
          name: 'Edit salary for Alex Example',
        })
      );
      const salary = screen.getByRole('textbox', {
        name: 'Full-time annual salary',
      });
      await user.clear(salary);
      await user.type(salary, '132000');
      await user.click(screen.getByRole('button', { name: 'Apply' }));
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      expect(api.creates).toHaveLength(0);
      expect(
        screen.queryByRole('button', { name: 'Save plan' })
      ).not.toBeInTheDocument();
      await user.click(
        screen.getByRole('button', { name: 'Create plan & open workspace' })
      );
      await waitFor(() =>
        expect(route.router.state.location.pathname).toBe(portfolioPath + '/71')
      );
      expect(api.creates).toHaveLength(1);
      expect(api.creates[0]).toMatchObject({
        creationKey: expect.any(String),
        draft: {
          jobs: [{ monthlySalary: 11_000 }],
          projects: api.seed.projects,
          seededAt: api.seed.seededAt,
        },
        historyMonths: 6,
        name: 'Reviewed plan',
      });
      expect(api.seedReads()).toBe(1);
      await user.click(await screen.findByRole('button', { name: 'Staffing' }));
      await user.click(
        screen.getByRole('button', { name: 'Edit salary for Alex Example' })
      );
      expect(
        screen.getByRole('textbox', { name: 'Full-time annual salary' })
      ).toHaveValue('132000.00');
      await user.clear(
        screen.getByRole('textbox', { name: 'Full-time annual salary' })
      );
      await user.type(
        screen.getByRole('textbox', { name: 'Full-time annual salary' }),
        '144000'
      );
      await user.click(screen.getByRole('button', { name: 'Apply' }));
      await user.click(screen.getByRole('button', { name: 'Save plan' }));
      await screen.findByRole('button', { name: '✓ Saved' });
      expect(api.updates).toHaveLength(1);
      expect(api.updates[0]).toMatchObject({
        expectedSeededAt: api.seed.seededAt,
        expectedUpdatedAt: '2026-02-01T00:00:00.0000001Z',
        jobs: [{ monthlySalary: 12_000 }],
      });
      expect(api.creates).toHaveLength(1);
    } finally {
      route.cleanup();
    }
  });

  it('keeps setup choices after a seed failure and creates nothing when setup is canceled', async () => {
    const api = handleLifecycle();
    let attempts = 0;
    server.use(
      http.get(createUrl + '/seed', () => {
        attempts++;
        return attempts === 1
          ? new HttpResponse(null, { status: 503 })
          : HttpResponse.json({ ...api.seed, historyMonths: 12 });
      })
    );
    const route = renderPlans();
    const user = userEvent.setup();
    try {
      await startWizard(user, 'Keep my choices');
      await user.selectOptions(
        screen.getByRole('combobox', { name: 'Averaging window' }),
        '12'
      );
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await screen.findByRole('alert');
      expect(screen.getByRole('textbox', { name: 'Plan name' })).toHaveValue(
        'Keep my choices'
      );
      expect(
        screen.getByRole('combobox', { name: 'Averaging window' })
      ).toHaveValue('12');
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await screen.findByRole('button', {
        name: 'Edit salary for Alex Example',
      });
      await user.click(screen.getByRole('button', { name: 'Cancel setup' }));
      await screen.findByRole('dialog', { name: 'Leave setup?' });
      await user.click(screen.getByRole('button', { name: 'Discard' }));
      await screen.findByRole('button', { name: 'New plan' });
      expect(api.creates).toHaveLength(0);
      expect(api.stored.size).toBe(0);
    } finally {
      route.cleanup();
    }
  });

  it('recovers a lost creation response with the same reviewed payload and key', async () => {
    const api = handleLifecycle();
    server.use(
      http.post(createUrl, async ({ request }) => {
        const saved = api.create(
          (await request.json()) as CreateProjectionDraftRequest
        );
        return api.creates.length === 1
          ? HttpResponse.error()
          : HttpResponse.json(saved);
      })
    );
    const route = renderPlans();
    const user = userEvent.setup();
    try {
      await startWizard(user);
      await reviewWizard(user);
      await user.click(
        screen.getByRole('button', { name: 'Create plan & open workspace' })
      );
      await screen.findByRole('button', { name: 'Retry creation' });
      expect(route.router.state.location.pathname).toBe(portfolioPath);
      expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
      expect(api.stored.size).toBe(1);
      await user.click(screen.getByRole('button', { name: 'Retry creation' }));
      await waitFor(() =>
        expect(route.router.state.location.pathname).toBe(portfolioPath + '/71')
      );
      expect(api.creates).toHaveLength(2);
      expect(api.creates[1]).toEqual(api.creates[0]);
      expect(api.stored.size).toBe(1);
    } finally {
      route.cleanup();
    }
  });

  it('duplicates captured inputs while fresh seed data is unavailable and recovers a lost copy response', async () => {
    const original = { ...createSalaryExample(), name: 'Saved original' };
    const api = handleLifecycle([original]);
    let seedReads = 0;
    server.use(
      http.get(createUrl + '/seed', () => {
        seedReads++;
        return new HttpResponse(null, { status: 503 });
      }),
      http.post(
        '/api/projections/:id/duplicate',
        async ({ params, request }) => {
          const saved = api.duplicate(
            Number(params.id),
            (await request.json()) as DuplicateProjectionRequest
          );
          return api.duplicates.length === 1
            ? HttpResponse.error()
            : HttpResponse.json(saved);
        }
      )
    );
    const route = renderPlans();
    const user = userEvent.setup();
    try {
      await user.click(
        await screen.findByRole('button', { name: 'Duplicate Saved original' })
      );
      await user.click(
        await screen.findByRole('button', {
          name: 'Retry duplicate Saved original',
        })
      );
      await waitFor(() =>
        expect(route.router.state.location.pathname).toBe(portfolioPath + '/71')
      );
      expect(seedReads).toBe(0);
      expect(api.duplicates).toHaveLength(2);
      expect(api.duplicates[1]).toEqual(api.duplicates[0]);
      expect(api.stored.size).toBe(2);
      expect(api.stored.get(original.id)).toEqual(original);
      expect(api.stored.get(71)).toMatchObject({
        jobs: original.jobs,
        projects: original.projects,
        seededAt: original.seededAt,
      });
    } finally {
      route.cleanup();
    }
  });

  it('does not navigate back after leaving a pending creation', async () => {
    const api = handleLifecycle();
    let finish!: () => void;
    const held = new Promise<void>((resolve) => {
      finish = resolve;
    });
    server.use(
      http.post(createUrl, async ({ request }) => {
        const saved = api.create(
          (await request.json()) as CreateProjectionDraftRequest
        );
        await held;
        return HttpResponse.json(saved);
      })
    );
    const route = renderPlans();
    const user = userEvent.setup();
    try {
      await startWizard(user);
      await reviewWizard(user);
      await user.click(
        screen.getByRole('button', { name: 'Create plan & open workspace' })
      );
      await waitFor(() => expect(api.creates).toHaveLength(1));
      await act(async () => {
        void route.router.navigate({ to: '/help' });
      });
      await screen.findByRole('dialog', { name: 'Leave while creating?' });
      await user.click(screen.getByRole('button', { name: 'Leave anyway' }));
      await waitFor(() =>
        expect(route.router.state.location.pathname).toBe('/help')
      );
      await act(async () => finish());
      await waitFor(() =>
        expect(
          route.queryClient.getQueryData<Projection>(['projections', 71])?.id
        ).toBe(71)
      );
      expect(route.router.state.location.pathname).toBe('/help');
    } finally {
      finish();
      route.cleanup();
    }
  });

  it('does not let a late duplicate replace a chosen plan while its loader is pending', async () => {
    const original = { ...createSalaryExample(), name: 'Saved original' };
    const destination = {
      ...createSalaryExample(),
      id: 2,
      name: 'Chosen plan',
    };
    const api = handleLifecycle([original, destination]);
    let finishDuplicate!: () => void;
    let finishDestination!: () => void;
    const heldDuplicate = new Promise<void>((resolve) => {
      finishDuplicate = resolve;
    });
    const heldDestination = new Promise<void>((resolve) => {
      finishDestination = resolve;
    });
    let destinationReads = 0;
    server.use(
      http.post(
        '/api/projections/:id/duplicate',
        async ({ params, request }) => {
          const saved = api.duplicate(
            Number(params.id),
            (await request.json()) as DuplicateProjectionRequest
          );
          await heldDuplicate;
          return HttpResponse.json(saved);
        }
      ),
      http.get('/api/projections/2', async () => {
        destinationReads++;
        await heldDestination;
        return HttpResponse.json(destination);
      })
    );
    const route = renderPlans();
    const user = userEvent.setup();
    try {
      await user.click(
        await screen.findByRole('button', { name: 'Duplicate Saved original' })
      );
      await waitFor(() => expect(api.duplicates).toHaveLength(1));
      await act(async () => {
        void route.router.navigate({
          params: { iamId: 'IAM-PREVIEW', projectionId: '2' },
          to: '/projections/$iamId/$projectionId',
        });
      });
      await waitFor(() => expect(destinationReads).toBe(1));
      await act(async () => finishDuplicate());
      await waitFor(() =>
        expect(
          route.queryClient.getQueryData<Projection>(['projections', 71])?.id
        ).toBe(71)
      );
      expect(route.router.state.location.pathname).toBe(portfolioPath + '/2');
      await act(async () => finishDestination());
      await screen.findByRole('heading', { name: 'Chosen plan' });
      expect(route.router.state.location.pathname).toBe(portfolioPath + '/2');
    } finally {
      finishDuplicate();
      finishDestination();
      route.cleanup();
    }
  });
});
