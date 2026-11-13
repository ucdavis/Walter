import { StrictMode } from 'react';
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
import {
  createSalaryExample,
  createAppointmentLookupsExample,
} from '@/test/fixtures/projections.ts';
import type {
  CreateProjectionDraftRequest,
  DuplicateProjectionRequest,
  Projection,
  ProjectionDraft,
  SaveProjectionRequest,
} from '@/queries/projections.ts';
import { routeTree } from '@/routeTree.gen.ts';
import { server } from '@/test/mswUtils.ts';
import { SUPPLIES_CATEGORY } from '@/lib/piProjection.ts';
import { chooseInitialProjects } from '@/test/helpers/projectionSourceSelection.ts';

const portfolioPath = '/projections/IAM-PREVIEW';
const createUrl = '/api/projections/by-iam/IAM-PREVIEW';

function renderPlans(strict = false, path = portfolioPath) {
  window.history.replaceState(null, '', path);
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
      {strict ? (
        <StrictMode>
          <RouterProvider router={router} />
        </StrictMode>
      ) : (
        <RouterProvider router={router} />
      )}
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
  const example = createSalaryExample();
  const seed: ProjectionDraft = {
    content: example.content,
    name: example.name,
    seededAt: '2026-01-01T00:00:00.1234567Z',
  };
  const roster = [{ appointmentId: 101, fundingSourceIds: [1, 2] }];
  for (const source of seed.content.fundingSources) {
    source.capturedAt = seed.seededAt;
  }
  const stored = new Map(plans.map((plan) => [plan.id, structuredClone(plan)]));
  const keys = new Map<string, number>();
  const creates: CreateProjectionDraftRequest[] = [];
  const duplicates: DuplicateProjectionRequest[] = [];
  const updates: SaveProjectionRequest[] = [];
  const seedHistoryWindows: number[] = [];
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
      id: nextId++,
      piEmployeeId: example.piEmployeeId,
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
        content: stored.get(id)!.content,
        name: body.name,
        seededAt: stored.get(id)!.seededAt,
      },
    });
  };
  server.use(
    http.get('/api/projections/lookups', () =>
      HttpResponse.json(createAppointmentLookupsExample())
    ),
    http.get('/api/user/me', () =>
      HttpResponse.json({
        email: 'preview@example.com',
        employeeId: example.piEmployeeId,
        iamId: 'IAM-PREVIEW',
        id: 'preview-user',
        isEmulating: false,
        kerberos: 'preview',
        name: 'Preview User',
        roles: [],
      })
    ),
    http.get(createUrl, () => HttpResponse.json([...stored.values()])),
    http.get(createUrl + '/sources', () => HttpResponse.json([])),
    http.get(createUrl + '/seed', ({ request }) => {
      seedReads++;
      const historyMonths = Number(
        new URL(request.url).searchParams.get('historyMonths') ?? 3
      );
      seedHistoryWindows.push(historyMonths);
      return HttpResponse.json({
        draft: {
          ...seed,
          content: { ...seed.content, historyMonths },
        },
        roster,
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
        content: body.content,
        name: body.name,
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
    roster,
    seed,
    seedHistoryWindows,
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
  await chooseInitialProjects(user, ['Project A', 'Project B']);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
  );
  await screen.findByRole('button', { name: 'Continue' });
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByRole('button', {
    name: 'Edit appointment for Alex Example',
  });
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByRole('button', { name: 'Change history window' });
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByRole('button', { name: /^Create plan/ });
}

async function changeHistoryWindow(
  user: ReturnType<typeof userEvent.setup>,
  historyMonths: string
) {
  await user.click(
    screen.getByRole('button', { name: 'Change history window' })
  );
  await screen.findByRole('dialog', { name: 'Change spending history' });
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Averaging window' }),
    historyMonths
  );
  await user.click(
    screen.getByRole('button', { name: 'Apply history window' })
  );
}

describe('projection creation and copies', () => {
  it('lets an open wizard save after the flag turns off without opening a new editing session', async () => {
    const api = handleLifecycle();
    const route = renderPlans();
    const user = userEvent.setup();
    try {
      await startWizard(user);
      server.use(
        http.get('/api/system/features', () =>
          HttpResponse.json({ projectionsEnabled: false })
        )
      );
      await act(async () => {
        await route.queryClient.invalidateQueries({
          queryKey: ['system', 'features'],
        });
      });
      await screen.findByText(/Projections have been turned off/);
      await reviewWizard(user);
      await user.click(screen.getByRole('button', { name: 'Create plan' }));
      await screen.findByText(/was saved\./);
      expect(api.creates).toHaveLength(1);
      expect(
        screen.getByText('Projections are not available.')
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'New plan' })
      ).not.toBeInTheDocument();
    } finally {
      route.cleanup();
    }
  });

  it('revisits completed steps without skipping selection or losing unapplied edits', async () => {
    const api = handleLifecycle();
    const route = renderPlans();
    const user = userEvent.setup();
    try {
      await startWizard(user);
      expect(screen.getByRole('button', { name: 'Staffing' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled();
      await reviewWizard(user);
      await user.click(screen.getByRole('button', { name: 'Funding sources' }));
      await user.clear(screen.getByLabelText('Plan name'));
      await user.click(screen.getByRole('button', { name: 'Review' }));
      expect(screen.getByLabelText('Plan name')).toBeInTheDocument();
      await user.type(screen.getByLabelText('Plan name'), 'Revisited plan');
      await user.selectOptions(
        screen.getByLabelText('Forecast duration'),
        '18'
      );
      await user.click(screen.getByRole('button', { name: 'Review' }));
      expect(
        await screen.findByRole('heading', { name: 'Revisited plan' })
      ).toBeInTheDocument();
      expect(screen.getByText(/18-month forecast/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Funding sources' }));
      await user.click(screen.getByRole('button', { name: 'Edit Project A' }));
      await user.type(screen.getByLabelText('Source name'), ' edited');
      await user.click(screen.getByRole('button', { name: 'Review' }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Apply or cancel your open editor'
      );
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      await user.click(
        screen.getByRole('button', { name: 'Projections dashboard' })
      );
      expect(
        await screen.findByRole('dialog', { name: 'Leave setup?' })
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Stay' }));
      expect(screen.getByLabelText('Plan name')).toHaveValue('Revisited plan');
      expect(api.creates).toHaveLength(0);
      expect(api.seedReads()).toBe(1);
    } finally {
      route.cleanup();
    }
  });

  it('captures once automatically while keeping details typed during a delayed response', async () => {
    const api = handleLifecycle();
    let release!: () => void;
    const responseReady = new Promise<void>((resolve) => {
      release = resolve;
    });
    let captures = 0;
    server.use(
      http.get(createUrl + '/seed', async () => {
        captures++;
        await responseReady;
        return HttpResponse.json({ draft: api.seed, roster: api.roster });
      })
    );
    const route = renderPlans(true);
    const user = userEvent.setup();
    try {
      await user.click(await screen.findByRole('button', { name: 'New plan' }));
      await screen.findByText('Loading funding sources...');
      expect(
        screen.queryByRole('button', { name: 'Load funding sources' })
      ).not.toBeInTheDocument();
      await user.type(
        screen.getByLabelText('Plan name'),
        'Typed while loading'
      );
      await user.type(
        screen.getByLabelText('What are you exploring? (optional)'),
        'Keep the renewal assumption.'
      );
      await user.selectOptions(
        screen.getByLabelText('Forecast duration'),
        '18'
      );
      expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
      release();
      await screen.findByRole('searchbox', { name: 'Search funding sources' });
      expect(
        screen.getByText('0 funding sources selected')
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Plan name')).toHaveValue(
        'Typed while loading'
      );
      expect(
        screen.getByLabelText('What are you exploring? (optional)')
      ).toHaveValue('Keep the renewal assumption.');
      expect(screen.getByLabelText('Forecast duration')).toHaveValue('18');
      await reviewWizard(user);
      for (const label of [
        'Edit staffing',
        'Edit funding sources',
        'Edit other expenses',
      ]) {
        await user.click(screen.getByRole('button', { name: label }));
        if (label === 'Edit staffing') {
          await user.click(
            screen.getByRole('button', {
              name: 'Edit appointment for Alex Example',
            })
          );
          await user.clear(screen.getByLabelText('Full-time annual salary'));
          await user.type(
            screen.getByLabelText('Full-time annual salary'),
            '84000'
          );
          await user.click(screen.getByRole('button', { name: 'Apply' }));
        }
        await user.click(
          screen.getByRole('button', { name: 'Return to review' })
        );
        await screen.findByRole('button', {
          name: 'Create plan & open workspace',
        });
      }
      expect(screen.getByLabelText('Plan notes (optional)')).toHaveValue(
        'Keep the renewal assumption.'
      );
      await user.click(
        screen.getByRole('button', { name: 'Create plan & open workspace' })
      );
      await waitFor(() => expect(api.creates).toHaveLength(1));
      expect(api.creates[0].draft).toMatchObject({
        content: { forecastMonths: 18, notes: 'Keep the renewal assumption.' },
        name: 'Typed while loading',
      });
      expect(api.creates[0].draft.content.appointments[0].monthlySalary).toBe(
        7000
      );
      expect(captures).toBe(1);
    } finally {
      release();
      route.cleanup();
    }
  });

  it('cancels untouched automatic capture without a discard prompt and ignores its late response', async () => {
    const api = handleLifecycle();
    let release!: () => void;
    const responseReady = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get(createUrl + '/seed', async () => {
        await responseReady;
        return HttpResponse.json({ draft: api.seed, roster: api.roster });
      })
    );
    const route = renderPlans();
    const user = userEvent.setup();
    try {
      await user.click(await screen.findByRole('button', { name: 'New plan' }));
      await screen.findByText('Loading funding sources...');
      await user.click(screen.getByRole('button', { name: 'Cancel setup' }));
      await screen.findByRole('button', { name: 'New plan' });
      expect(
        screen.queryByRole('dialog', { name: 'Leave setup?' })
      ).not.toBeInTheDocument();
      await act(async () => {
        release();
        await responseReady;
      });
      expect(
        screen.queryByRole('region', { name: 'New plan setup' })
      ).not.toBeInTheDocument();
      expect(api.creates).toHaveLength(0);
    } finally {
      release();
      route.cleanup();
    }
  });

  it('does not treat a completed automatic capture as user work or allow an unnamed plan to continue', async () => {
    handleLifecycle();
    const route = renderPlans();
    const user = userEvent.setup();
    try {
      await user.click(await screen.findByRole('button', { name: 'New plan' }));
      await screen.findByRole('searchbox', { name: 'Search funding sources' });
      expect(
        screen.queryByRole('checkbox', { name: /^Include / })
      ).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
      await user.click(screen.getByRole('button', { name: 'Cancel setup' }));
      await screen.findByRole('button', { name: 'New plan' });
      expect(
        screen.queryByRole('dialog', { name: 'Leave setup?' })
      ).not.toBeInTheDocument();
    } finally {
      route.cleanup();
    }
  });

  it('retains wizard duration and notes when revisiting setup and creates them with the original snapshot', async () => {
    const api = handleLifecycle();
    api.seed.content.appointments[0].allocations[0].percent = 0.25;
    const route = renderPlans();
    const user = userEvent.setup();
    try {
      await startWizard(user, 'Detailed plan');
      expect(screen.getByLabelText('Forecast duration')).toHaveValue('12');
      await user.selectOptions(
        screen.getByLabelText('Forecast duration'),
        '18'
      );
      await reviewWizard(user);
      expect(
        screen.getByText('18-month forecast, Jan 2026 through Jun 2027.')
      ).toBeInTheDocument();
      const notes = 'Assume renewal in June.\n  Keep this indentation.';
      await user.type(screen.getByLabelText('Plan notes (optional)'), notes);
      expect(
        screen.getByRole('region', { name: 'Items to review' })
      ).toHaveTextContent('1 appointment has unallocated time.');
      await user.click(screen.getByRole('button', { name: 'Edit staffing' }));
      await screen.findByRole('button', {
        name: 'Edit appointment for Alex Example',
      });
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      expect(screen.getByLabelText('Plan notes (optional)')).toHaveValue(notes);
      await user.click(
        screen.getByRole('button', { name: 'Edit other expenses' })
      );
      await screen.findByRole('button', { name: 'Change history window' });
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      expect(screen.getByLabelText('Plan notes (optional)')).toHaveValue(notes);
      await user.click(
        screen.getByRole('button', { name: 'Edit funding sources' })
      );
      expect(screen.getByLabelText('Forecast duration')).toHaveValue('18');
      await user.selectOptions(
        screen.getByLabelText('Forecast duration'),
        '12'
      );
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      expect(screen.getByLabelText('Plan notes (optional)')).toHaveValue(notes);
      expect(
        screen.getByText('12-month forecast, Jan 2026 through Dec 2026.')
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Create plan & open workspace' })
      ).toBeEnabled();
      await user.click(
        screen.getByRole('button', { name: 'Create plan & open workspace' })
      );
      await waitFor(() => expect(api.creates).toHaveLength(1));
      expect(api.creates[0].draft).toMatchObject({
        content: { forecastMonths: 12, notes },
        name: 'Detailed plan',
        seededAt: api.seed.seededAt,
      });
      expect(api.seedReads()).toBe(1);
      await user.click(
        await screen.findByRole('button', { name: 'Edit plan details' })
      );
      expect(screen.getByLabelText('Plan notes (optional)')).toHaveValue(notes);
      expect(
        screen.queryByRole('region', { name: 'Plan notes' })
      ).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
    } finally {
      route.cleanup();
    }
  });

  it('reviews allocations during wizard staffing and saves the acknowledged import notice', async () => {
    const api = handleLifecycle();
    api.seed.content.appointments[0].hasUnmatchedFunding = true;
    const route = renderPlans();
    const user = userEvent.setup();
    try {
      await startWizard(user);
      await chooseInitialProjects(user, ['Project A', 'Project B']);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
      );
      await user.click(await screen.findByRole('button', { name: 'Continue' }));
      await screen.findByText(/An imported funding task could not be matched/);
      await user.click(
        screen.getByRole('button', { name: 'Edit funding for Alex Example' })
      );
      await screen.findByRole('dialog', {
        name: 'Alex Example funding',
      });
      await user.click(screen.getByRole('button', { name: /^Replace / }));
      expect(
        screen.queryByText(/An imported funding task could not be matched/)
      ).not.toBeInTheDocument();
      expect(api.creates).toHaveLength(0);
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.click(
        screen.getByRole('button', { name: 'Create plan & open workspace' })
      );
      await waitFor(() => expect(api.creates).toHaveLength(1));
      expect(
        api.creates[0].draft.content.appointments[0].hasUnmatchedFunding
      ).toBe(false);
      expect(api.creates[0].draft.content.appointments[0].allocations).toEqual(
        api.seed.content.appointments[0].allocations
      );
    } finally {
      route.cleanup();
    }
  });

  it('requires a retained imported salary before creating and accepts an entered zero', async () => {
    const api = handleLifecycle();
    api.seed.content.appointments[0].monthlySalary = null;
    const route = renderPlans();
    const user = userEvent.setup();
    try {
      await startWizard(user, 'Incomplete salary plan');
      await reviewWizard(user);
      expect(
        screen.getByRole('button', { name: 'Create plan & open workspace' })
      ).toBeDisabled();
      expect(api.creates).toHaveLength(0);
      await user.click(screen.getByRole('button', { name: 'Back' }));
      await user.click(screen.getByRole('button', { name: 'Back' }));
      await user.click(
        screen.getByRole('button', {
          name: 'Edit appointment for Alex Example',
        })
      );
      await user.type(
        await screen.findByLabelText('Full-time annual salary'),
        '0'
      );
      await user.click(screen.getByRole('button', { name: 'Apply' }));
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.click(
        screen.getByRole('button', { name: 'Create plan & open workspace' })
      );
      await waitFor(() => expect(api.creates).toHaveLength(1));
      expect(api.creates[0].draft.content.appointments[0].monthlySalary).toBe(
        0
      );
    } finally {
      route.cleanup();
    }
  });

  it('saves the reviewed wizard snapshot before opening its saved workspace and then uses normal saves', async () => {
    const api = handleLifecycle();
    const route = renderPlans();
    const user = userEvent.setup();
    try {
      await startWizard(user);
      expect(
        screen.queryByRole('combobox', { name: 'Averaging window' })
      ).not.toBeInTheDocument();
      expect(api.creates).toHaveLength(0);
      await chooseInitialProjects(user, ['Project A', 'Project B']);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
      );
      await screen.findByRole('button', { name: 'Continue' });
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.click(
        await screen.findByRole('button', {
          name: 'Edit appointment for Alex Example',
        })
      );
      const salary = screen.getByRole('textbox', {
        name: 'Full-time annual salary',
      });
      await user.clear(salary);
      await user.type(salary, '132000');
      await user.click(screen.getByRole('button', { name: 'Apply' }));
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await changeHistoryWindow(user, '6');
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
          content: {
            appointments: [{ monthlySalary: 11_000 }],
            fundingSources: api.seed.content.fundingSources,
            historyMonths: 6,
          },
          name: 'Reviewed plan',
          seededAt: api.seed.seededAt,
        },
      });
      expect(api.seedReads()).toBe(1);
      expect(api.seedHistoryWindows).toEqual([3]);
      await user.click(await screen.findByRole('button', { name: 'Staffing' }));
      await user.click(
        screen.getByRole('button', {
          name: 'Edit appointment for Alex Example',
        })
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
        content: { appointments: [{ monthlySalary: 12_000 }] },
        expectedSeededAt: api.seed.seededAt,
        expectedUpdatedAt: '2026-02-01T00:00:00.0000001Z',
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
          : HttpResponse.json({
              draft: {
                ...api.seed,
                content: { ...api.seed.content, historyMonths: 3 },
              },
              roster: api.roster,
            });
      })
    );
    const route = renderPlans();
    const user = userEvent.setup();
    try {
      await startWizard(user, 'Keep my choices');
      await screen.findByRole('alert');
      expect(screen.getByRole('textbox', { name: 'Plan name' })).toHaveValue(
        'Keep my choices'
      );
      await user.click(screen.getByRole('button', { name: 'Retry funding' }));
      await chooseInitialProjects(user, ['Project A', 'Project B']);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
      );
      await user.click(await screen.findByRole('button', { name: 'Continue' }));
      await screen.findByRole('button', {
        name: 'Edit appointment for Alex Example',
      });
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await changeHistoryWindow(user, '12');
      expect(attempts).toBe(2);
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

  it('creates the reviewed expense assumptions and history window without replacing captured inputs', async () => {
    const api = handleLifecycle();
    const category = SUPPLIES_CATEGORY;
    api.seed.content.fundingSources[0].runRates = [
      { expenditureCategory: category, historyMonths: 3, monthlyAmount: 500 },
      { expenditureCategory: category, historyMonths: 6, monthlyAmount: 600 },
    ];
    const captured = structuredClone(api.seed);
    const route = renderPlans();
    const user = userEvent.setup();
    try {
      await startWizard(user, 'Reviewed expense plan');
      await chooseInitialProjects(user, ['Project A', 'Project B']);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
      );
      await user.click(await screen.findByRole('button', { name: 'Continue' }));
      await screen.findByRole('button', {
        name: 'Edit appointment for Alex Example',
      });
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      expect(screen.getByLabelText('View expenses for')).toHaveValue('');
      await user.click(
        screen.getByRole('button', {
          name: `Edit historical amount for ${category}`,
        })
      );
      await user.clear(screen.getByLabelText('Monthly amount'));
      await user.type(screen.getByLabelText('Monthly amount'), '300');
      await user.click(screen.getByRole('button', { name: 'Apply amount' }));
      await user.click(
        screen.getAllByRole('button', { name: 'Add expense' })[0]
      );
      expect(screen.getByLabelText('Charge to')).toHaveValue('');
      await user.type(
        screen.getByLabelText('Expense name'),
        'Planned supply credit'
      );
      await user.selectOptions(screen.getByLabelText('Category'), category);
      await user.type(screen.getByLabelText('Monthly amount'), '-125.50');
      expect(
        screen.getByRole('button', { name: 'Apply expense' })
      ).toBeDisabled();
      await user.selectOptions(screen.getByLabelText('Charge to'), '1');
      expect(
        screen.getByRole('button', { name: 'Apply expense' })
      ).toBeEnabled();
      await user.click(screen.getByRole('button', { name: 'Apply expense' }));
      await changeHistoryWindow(user, '6');
      expect(api.creates).toHaveLength(0);
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.click(
        screen.getByRole('button', { name: 'Create plan & open workspace' })
      );
      await waitFor(() =>
        expect(route.router.state.location.pathname).toBe(portfolioPath + '/71')
      );

      expect(api.creates).toHaveLength(1);
      expect(api.creates[0].draft).toEqual({
        ...captured,
        content: {
          ...captured.content,
          fundingSources: [
            {
              ...captured.content.fundingSources[0],
              expenses: [
                {
                  amount: -125.5,
                  description: 'Planned supply credit',
                  endMonth: null,
                  expenditureCategory: category,
                  id: 1,
                  kind: 'Monthly',
                  startMonth: '2026-01-01',
                },
              ],
              historicalExpenseOverrides: [
                { amount: 300, expenditureCategory: category },
              ],
            },
            captured.content.fundingSources[1],
          ],
          historyMonths: 6,
        },
        name: 'Reviewed expense plan',
      });
      expect(api.seedReads()).toBe(1);
      expect(api.seedHistoryWindows).toEqual([3]);
      expect(api.seed).toEqual(captured);
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
      expect(screen.getByLabelText('Plan notes (optional)')).toBeDisabled();
      for (const name of [
        'Edit funding sources',
        'Edit staffing',
        'Edit other expenses',
      ]) {
        expect(screen.getByRole('button', { name })).toBeDisabled();
      }
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
    const original = createSalaryExample();
    original.name = 'Saved original';
    original.content.forecastMonths = 18;
    original.content.notes = 'Keep this assumption\n  in the copy';
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
    const route = renderPlans(false, `${portfolioPath}/${original.id}`);
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
        content: {
          appointments: original.content.appointments,
          forecastMonths: original.content.forecastMonths,
          fundingSources: original.content.fundingSources,
          notes: original.content.notes,
        },
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
    const original = createSalaryExample();
    original.name = 'Saved original';
    original.content.forecastMonths = 18;
    original.content.notes = 'Keep this assumption\n  in the copy';
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
    const route = renderPlans(false, `${portfolioPath}/${original.id}`);
    const user = userEvent.setup();
    try {
      await user.click(
        await screen.findByRole('button', { name: 'Duplicate Saved original' })
      );
      await waitFor(() => expect(api.duplicates).toHaveLength(1));
      await user.click(
        screen.getByRole('button', { name: 'Edit plan details' })
      );
      expect(
        screen.getByRole('button', { name: 'Delete plan' })
      ).toBeDisabled();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
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
  it('keeps deletion confirmation safe, preserves canceled typing, and removes only the confirmed saved version', async () => {
    const original = createSalaryExample();
    original.name = 'Delete candidate';
    original.updatedAt = '2026-02-01T00:00:00.1234567Z';
    const api = handleLifecycle([original]);
    const tokens: string[] = [];
    server.use(
      http.delete('/api/projections/:id', ({ params, request }) => {
        tokens.push(
          new URL(request.url).searchParams.get('expectedUpdatedAt')!
        );
        api.stored.delete(Number(params.id));
        return new HttpResponse(null, { status: 204 });
      })
    );
    const route = renderPlans(false, `${portfolioPath}/${original.id}`);
    const user = userEvent.setup();
    try {
      await user.click(
        await screen.findByRole('button', { name: 'Edit plan details' })
      );
      await user.clear(screen.getByRole('textbox', { name: 'Plan name' }));
      await user.type(
        screen.getByRole('textbox', { name: 'Plan name' }),
        'Unapplied name'
      );
      await user.click(screen.getByRole('button', { name: 'Delete plan' }));
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
      await user.keyboard('{Enter}');
      expect(tokens).toEqual([]);
      expect(screen.getByRole('textbox', { name: 'Plan name' })).toHaveValue(
        'Unapplied name'
      );
      await user.click(screen.getByRole('button', { name: 'Delete plan' }));
      await user.click(
        screen.getByRole('button', { name: 'Permanently delete plan' })
      );
      await waitFor(() =>
        expect(route.router.state.location.pathname).toBe(portfolioPath)
      );
      expect(tokens).toEqual([original.updatedAt]);
      expect(
        route.queryClient.getQueryData(['projections', original.id])
      ).toBeUndefined();
      expect(
        screen.queryByRole('dialog', { name: 'Leave this plan?' })
      ).not.toBeInTheDocument();
    } finally {
      route.cleanup();
    }
  });

  it('retries deletion against the original timestamp and requires whole-plan reload after a conflict', async () => {
    const original = createSalaryExample();
    original.name = 'Versioned plan';
    const api = handleLifecycle([original]);
    const tokens: string[] = [];
    server.use(
      http.delete('/api/projections/:id', ({ request }) => {
        tokens.push(
          new URL(request.url).searchParams.get('expectedUpdatedAt')!
        );
        return tokens.length === 1
          ? HttpResponse.error()
          : new HttpResponse(null, { status: 409 });
      })
    );
    const route = renderPlans(false, `${portfolioPath}/${original.id}`);
    const user = userEvent.setup();
    try {
      await user.click(
        await screen.findByRole('button', { name: 'Edit plan details' })
      );
      await user.clear(screen.getByRole('textbox', { name: 'Plan name' }));
      await user.type(
        screen.getByRole('textbox', { name: 'Plan name' }),
        'Local typing'
      );
      await user.click(screen.getByRole('button', { name: 'Delete plan' }));
      await user.click(
        screen.getByRole('button', { name: 'Permanently delete plan' })
      );
      await user.click(
        await screen.findByRole('button', { name: 'Retry delete' })
      );
      await screen.findByText(/This plan changed since you opened it/);
      expect(tokens).toEqual([original.updatedAt, original.updatedAt]);
      expect(
        screen.queryByRole('button', { name: 'Retry delete' })
      ).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.getByRole('textbox', { name: 'Plan name' })).toHaveValue(
        'Local typing'
      );
      const newer = {
        ...original,
        name: 'Reviewed newer plan',
        updatedAt: '2026-04-01T00:00:00.7654321Z',
      };
      api.stored.set(original.id, newer);
      let failReload = true;
      server.use(
        http.get('/api/projections/:id', () =>
          failReload
            ? new HttpResponse(null, { status: 503 })
            : HttpResponse.json(newer)
        )
      );
      await user.click(screen.getByRole('button', { name: 'Delete plan' }));
      await user.click(
        await screen.findByRole('button', {
          name: 'Discard edits and reload plan',
        })
      );
      await screen.findAllByText(/The saved plan could not be loaded/);
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.getByRole('textbox', { name: 'Plan name' })).toHaveValue(
        'Local typing'
      );
      failReload = false;
      await user.click(screen.getByRole('button', { name: 'Delete plan' }));
      await user.click(
        screen.getByRole('button', { name: 'Discard edits and reload plan' })
      );
      await screen.findByRole('heading', { level: 1, name: newer.name });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(tokens).toEqual([original.updatedAt, original.updatedAt]);
      await user.click(
        screen.getByRole('button', { name: 'Edit plan details' })
      );
      await user.click(screen.getByRole('button', { name: 'Delete plan' }));
      await user.click(
        screen.getByRole('button', { name: 'Permanently delete plan' })
      );
      await waitFor(() => expect(tokens.at(-1)).toBe(newer.updatedAt));
    } finally {
      route.cleanup();
    }
  });

  it('requires saving applied edits before duplicating the saved plan', async () => {
    const original = createSalaryExample();
    original.name = 'Saved version';
    const api = handleLifecycle([original]);
    const route = renderPlans(false, `${portfolioPath}/${original.id}`);
    const user = userEvent.setup();
    try {
      const duplicate = await screen.findByRole('button', {
        name: 'Duplicate Saved version',
      });
      expect(duplicate).toBeEnabled();
      await user.click(
        screen.getByRole('button', { name: 'Edit plan details' })
      );
      await user.clear(screen.getByRole('textbox', { name: 'Plan name' }));
      await user.type(
        screen.getByRole('textbox', { name: 'Plan name' }),
        'Edited version'
      );
      await user.click(
        screen.getByRole('button', { name: 'Apply plan details' })
      );
      expect(duplicate).toBeDisabled();
      expect(duplicate).toHaveAttribute(
        'title',
        'Save changes before duplicating'
      );
      expect(api.duplicates).toEqual([]);
    } finally {
      route.cleanup();
    }
  });
  it('recovers a lost deletion response when retry confirms absence, but preserves work on access failure', async () => {
    const original = createSalaryExample();
    const api = handleLifecycle([original]);
    let attempts = 0;
    const tokens: string[] = [];
    server.use(
      http.delete('/api/projections/:id', ({ request }) => {
        attempts++;
        tokens.push(
          new URL(request.url).searchParams.get('expectedUpdatedAt')!
        );
        if (attempts === 1) {
          return new HttpResponse(null, { status: 403 });
        }
        if (attempts === 2) {
          api.stored.delete(original.id);
          return HttpResponse.error();
        }
        return new HttpResponse(null, { status: 404 });
      })
    );
    const route = renderPlans(false, `${portfolioPath}/${original.id}`);
    const user = userEvent.setup();
    try {
      await user.click(
        await screen.findByRole('button', { name: 'Edit plan details' })
      );
      await user.click(screen.getByRole('button', { name: 'Delete plan' }));
      await user.click(
        screen.getByRole('button', { name: 'Permanently delete plan' })
      );
      await screen.findByRole('button', { name: 'Retry delete' });
      expect(route.router.state.location.pathname).toBe(
        `${portfolioPath}/${original.id}`
      );
      expect(api.stored.has(original.id)).toBe(true);
      await user.click(screen.getByRole('button', { name: 'Retry delete' }));
      await waitFor(() => expect(attempts).toBe(2));
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Retry delete' })
        ).toBeEnabled()
      );
      await user.click(screen.getByRole('button', { name: 'Retry delete' }));
      await waitFor(() =>
        expect(route.router.state.location.pathname).toBe(portfolioPath)
      );
      expect(tokens).toEqual([
        original.updatedAt,
        original.updatedAt,
        original.updatedAt,
      ]);
      expect(
        route.queryClient.getQueryData(['projections', original.id])
      ).toBeUndefined();
    } finally {
      route.cleanup();
    }
  });
  it('does not redirect after leaving an in-flight deletion', async () => {
    const original = createSalaryExample();
    const destination = { ...original, id: 2, name: 'Chosen destination' };
    const api = handleLifecycle([original, destination]);
    let finish!: () => void;
    const held = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let requests = 0;
    server.use(
      http.delete('/api/projections/:id', async () => {
        requests++;
        await held;
        api.stored.delete(original.id);
        return new HttpResponse(null, { status: 204 });
      })
    );
    const route = renderPlans(false, `${portfolioPath}/${original.id}`);
    const user = userEvent.setup();
    try {
      await user.click(
        await screen.findByRole('button', { name: 'Edit plan details' })
      );
      await user.click(screen.getByRole('button', { name: 'Delete plan' }));
      await user.click(
        screen.getByRole('button', { name: 'Permanently delete plan' })
      );
      await waitFor(() => expect(requests).toBe(1));
      await act(async () => {
        void route.router.navigate({
          params: { iamId: 'IAM-PREVIEW', projectionId: '2' },
          to: '/projections/$iamId/$projectionId',
        });
      });
      await user.click(await screen.findByRole('button', { name: 'Discard' }));
      await screen.findByRole('heading', { level: 1, name: destination.name });
      await act(async () => finish());
      await waitFor(() => expect(api.stored.has(original.id)).toBe(false));
      expect(route.router.state.location.pathname).toBe(`${portfolioPath}/2`);
    } finally {
      finish();
      route.cleanup();
    }
  });
  it('keeps deletion disabled until duplicate destination loading completes', async () => {
    const original = createSalaryExample();
    original.name = 'Copy source';
    const api = handleLifecycle([original]);
    let finishCopy!: () => void;
    let finishLoader!: () => void;
    const heldCopy = new Promise<void>((resolve) => {
      finishCopy = resolve;
    });
    const heldLoader = new Promise<void>((resolve) => {
      finishLoader = resolve;
    });
    let loaderReads = 0;
    server.use(
      http.post(
        '/api/projections/:id/duplicate',
        async ({ params, request }) => {
          const saved = api.duplicate(
            Number(params.id),
            (await request.json()) as DuplicateProjectionRequest
          );
          await heldCopy;
          return HttpResponse.json(saved);
        }
      ),
      http.get('/api/projections/71', async () => {
        loaderReads++;
        await heldLoader;
        return HttpResponse.json(api.stored.get(71));
      })
    );
    const route = renderPlans(false, `${portfolioPath}/${original.id}`);
    const user = userEvent.setup();
    try {
      await user.click(
        await screen.findByRole('button', { name: 'Duplicate Copy source' })
      );
      await waitFor(() => expect(api.duplicates).toHaveLength(1));
      await user.click(
        screen.getByRole('button', { name: 'Edit plan details' })
      );
      expect(
        screen.getByRole('button', { name: 'Delete plan' })
      ).toBeDisabled();
      await act(async () => finishCopy());
      await waitFor(() => expect(loaderReads).toBe(1));
      expect(
        screen.getByRole('button', { name: 'Delete plan' })
      ).toBeDisabled();
      await act(async () => finishLoader());
      await screen.findByRole('heading', {
        level: 1,
        name: 'Copy source copy',
      });
    } finally {
      finishCopy();
      finishLoader();
      route.cleanup();
    }
  });
});
