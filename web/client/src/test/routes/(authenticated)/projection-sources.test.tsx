import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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
  Projection,
  ProjectionFundingSource,
  SaveProjectionRequest,
} from '@/queries/projections.ts';
import { routeTree } from '@/routeTree.gen.ts';
import { sourcePlanningBalance } from '@/lib/projectionSources.ts';
import { server } from '@/test/mswUtils.ts';
import { chooseInitialProjects } from '@/test/helpers/projectionSourceSelection.ts';

const portfolioPath = '/projections/IAM-PREVIEW';
const portfolioApi = '/api/projections/by-iam/IAM-PREVIEW';

function taskFixture(): Projection {
  const plan = createSalaryExample();
  plan.seededAt = '2026-01-01T00:00:00.1234567Z';
  plan.updatedAt = '2026-01-02T00:00:00.1234567Z';
  const task = (
    id: number,
    projectNumber: string,
    taskNumber: string,
    name: string
  ): ProjectionFundingSource => ({
    ...structuredClone(plan.content.fundingSources[0]),
    capturedAt: plan.seededAt,
    capturedEndDate: '2026-06-30',
    capturedStartDate: '2026-01-01',
    id,
    name: projectNumber === 'PA' ? 'Project A' : 'Project B',
    projectName: projectNumber === 'PA' ? 'Project A' : 'Project B',
    projectNumber,
    sourceKind: 'Task',
    taskName: name,
    taskNumber,
  });
  plan.content.fundingSources = [
    task(1, 'PA', 'T1', 'Task One'),
    task(2, 'PA', 'T2', 'Task Two'),
    task(3, 'PB', 'T1', 'Other Project Task'),
  ];
  plan.content.fundingSources[1].expenses = [
    {
      amount: 5000,
      description: 'Planned travel',
      endMonth: null,
      expenditureCategory: '05 - Travel',
      id: 1,
      kind: 'OneTime',
      startMonth: '2026-05-01',
    },
  ];
  const alex = plan.content.appointments[0];
  plan.content.appointments = [
    alex,
    {
      ...structuredClone(alex),
      allocations: [{ ...alex.allocations[0], fundingSourceId: 2, percent: 1 }],
      id: 102,
      name: 'Blair Example',
    },
    {
      ...structuredClone(alex),
      allocations: [{ ...alex.allocations[0], fundingSourceId: 3, percent: 1 }],
      id: 103,
      name: 'Casey Example',
    },
  ];
  return plan;
}

function setup(plan = taskFixture()) {
  let saved = structuredClone(plan);
  const roster = [
    { appointmentId: 101, fundingSourceIds: [1, 2] },
    { appointmentId: 102, fundingSourceIds: [2] },
    { appointmentId: 103, fundingSourceIds: [3] },
  ];
  const creates: CreateProjectionDraftRequest[] = [];
  const saves: SaveProjectionRequest[] = [];
  const imports: {
    sources: { projectNumber: string; taskNumber: string | null }[];
  }[] = [];
  const fresh = structuredClone(plan.content.fundingSources[1]);
  fresh.capturedAt = '2026-03-15T12:00:00.7654321Z';
  fresh.budgets[0].budget = 50_000;
  fresh.expenses = [];
  // The importer owns no plan-local identity; the client must allocate a new one.
  fresh.id = 1;
  server.use(
    http.get('/api/projections/lookups', () =>
      HttpResponse.json(createAppointmentLookupsExample())
    ),
    http.get('/api/user/me', () =>
      HttpResponse.json({
        email: 'preview@example.com',
        employeeId: plan.piEmployeeId,
        iamId: 'IAM-PREVIEW',
        id: 'preview-user',
        isEmulating: false,
        kerberos: 'preview',
        name: 'Preview User',
        roles: [],
      })
    ),
    http.get(portfolioApi, () => HttpResponse.json([saved])),
    http.get(portfolioApi + '/seed', () =>
      HttpResponse.json({
        draft: {
          content: plan.content,
          name: plan.name,
          seededAt: plan.seededAt,
        },
        roster,
      })
    ),
    http.get('/api/projections/:id', () => HttpResponse.json(saved)),
    http.post(portfolioApi, async ({ request }) => {
      const body = (await request.json()) as CreateProjectionDraftRequest;
      creates.push(body);
      saved = {
        ...plan,
        ...body.draft,
        id: 71,
      };
      return HttpResponse.json(saved);
    }),
    http.put('/api/projections/:id', async ({ request }) => {
      const body = (await request.json()) as SaveProjectionRequest;
      saves.push(body);
      saved = {
        ...saved,
        content: body.content,
        name: body.name,
        updatedAt: '2026-04-01T12:00:00.0000001Z',
      };
      return HttpResponse.json(saved);
    }),
    http.get(portfolioApi + '/sources', () =>
      HttpResponse.json(
        plan.content.fundingSources.map((source) => ({
          availableBalance: sourcePlanningBalance(source),
          capturedAt: source.capturedAt,
          projectName: source.projectName,
          projectNumber: source.projectNumber,
          taskName: source.taskName,
          taskNumber: source.taskNumber,
        }))
      )
    ),
    http.post(portfolioApi + '/sources/import', async ({ request }) => {
      imports.push((await request.json()) as (typeof imports)[number]);
      return HttpResponse.json([fresh]);
    })
  );
  return { creates, fresh, imports, plan, roster, saves };
}

function renderPlan(path = portfolioPath + '/1?section=funding') {
  window.history.replaceState(null, '', path);
  const history = createBrowserHistory();
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const router = createRouter({ context: { queryClient }, history, routeTree });
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
    router,
  };
}

describe('funding source lifecycle', () => {
  it('continues an empty selection without silently including funding or staff', async () => {
    const api = setup();
    const route = renderPlan(portfolioPath);
    const user = userEvent.setup();
    try {
      await user.click(await screen.findByRole('button', { name: 'New plan' }));
      await user.type(
        screen.getByLabelText('Plan name'),
        'Empty planning scenario'
      );
      await screen.findByText('0 funding sources selected');
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      expect(
        screen.queryByRole('button', { name: /^Edit appointment for / })
      ).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.click(
        screen.getByRole('button', { name: 'Create plan & open workspace' })
      );
      await waitFor(() => expect(api.creates).toHaveLength(1));
      expect(api.creates[0].draft.content.fundingSources).toEqual([]);
      expect(api.creates[0].draft.content.appointments).toEqual([]);
    } finally {
      route.cleanup();
    }
  });

  it('opens the funding list from a selected outlook without treating the source as an edit request', async () => {
    setup();
    const route = renderPlan(portfolioPath + '/1?section=overview&source=2');
    const user = userEvent.setup();
    try {
      expect(
        await screen.findByRole('combobox', {
          name: 'Explore a funding source',
        })
      ).toHaveValue('2');
      const sectionButton = within(
        screen.getByRole('navigation', { name: 'Plan sections' })
      ).getByRole('button', { name: 'Funding sources' });
      sectionButton.focus();
      await user.keyboard('{Enter}');
      await waitFor(() =>
        expect(route.router.state.location.search).toEqual({
          section: 'funding',
        })
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(
        await screen.findByRole('button', { name: /Edit .*Task T2/ })
      ).toBeInTheDocument();
      await act(async () => route.router.history.back());
      await waitFor(() =>
        expect(route.router.state.location.search).toMatchObject({
          section: 'overview',
          source: 2,
        })
      );
      expect(
        await screen.findByRole('combobox', {
          name: 'Explore a funding source',
        })
      ).toHaveValue('2');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await act(async () => route.router.history.forward());
      await waitFor(() =>
        expect(route.router.state.location.search).toEqual({
          section: 'funding',
        })
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await user.click(
        await screen.findByRole('button', { name: /Edit .*Task T2/ })
      );
      await screen.findByRole('dialog', { name: /Edit .*Task T2/ });
      expect(route.router.state.location.search).toMatchObject({
        section: 'funding',
        source: 2,
      });
    } finally {
      route.cleanup();
    }
  });

  it('opens a source editor by URL and restores the addressed source through Back and Forward', async () => {
    setup();
    const route = renderPlan(portfolioPath + '/1?section=funding&source=2');
    const user = userEvent.setup();
    try {
      await screen.findByRole('dialog', { name: /Edit .*Task T2/ });
      expect(screen.getByLabelText('Source name')).toHaveFocus();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      );
      await user.click(
        screen.getByRole('button', { name: /Edit .*Task T1.*Task One/ })
      );
      await waitFor(() =>
        expect(route.router.state.location.search.source).toBe(1)
      );
      await user.clear(screen.getByLabelText('Planning balance'));
      await user.type(screen.getByLabelText('Planning balance'), '23000');
      await act(async () => route.router.history.back());
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      );
      await act(async () => route.router.history.forward());
      await screen.findByRole('dialog', { name: /Edit .*Task T1.*Task One/ });
      expect(screen.getByLabelText('Planning balance')).toHaveValue('20000.00');
      expect(screen.getByLabelText('Source name')).toHaveFocus();
      expect(
        screen.getByRole('button', { hidden: true, name: 'Save plan' })
      ).toBeDisabled();
    } finally {
      route.cleanup();
    }
  });

  it('retains only the initial personnel tied to selected tasks', async () => {
    const api = setup();
    const route = renderPlan(portfolioPath);
    const user = userEvent.setup();
    try {
      await user.click(await screen.findByRole('button', { name: 'New plan' }));
      await user.type(
        screen.getByRole('textbox', { name: 'Plan name' }),
        'Selected task plan'
      );
      const search = await screen.findByRole('searchbox', {
        name: 'Search funding sources',
      });
      expect(
        screen.getByText('0 funding sources selected')
      ).toBeInTheDocument();
      expect(screen.queryByRole('article')).not.toBeInTheDocument();
      await user.type(search, 'Task One');
      const results = screen.getByRole('region', {
        name: 'Project A search results',
      });
      await user.click(
        within(results).getByRole('button', { name: 'Add this task' })
      );
      expect(
        screen.getByRole('region', { name: 'Project A selected funding' })
      ).toHaveTextContent('1 of 2 tasks');
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await screen.findByRole('button', {
        name: 'Edit appointment for Alex Example',
      });
      expect(
        screen.queryByRole('button', {
          name: 'Edit appointment for Blair Example',
        })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', {
          name: 'Edit appointment for Casey Example',
        })
      ).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.click(
        screen.getByRole('button', { name: 'Create plan & open workspace' })
      );
      await waitFor(() => expect(api.creates).toHaveLength(1));
      expect(api.creates[0].draft.content.fundingSources).toEqual([
        api.plan.content.fundingSources[0],
      ]);
      expect(
        api.creates[0].draft.content.appointments.map(({ name }) => name)
      ).toEqual(['Alex Example']);
      expect(api.creates[0].draft.content.appointments[0].allocations).toEqual([
        api.plan.content.appointments[0].allocations[0],
      ]);
      expect(Object.keys(api.creates[0]).sort()).toEqual([
        'creationKey',
        'draft',
      ]);
      expect(Object.keys(api.creates[0].draft).sort()).toEqual([
        'content',
        'name',
        'seededAt',
      ]);
      expect(Object.keys(api.creates[0].draft.content).sort()).toEqual([
        'appointments',
        'forecastMonths',
        'fundingSources',
        'historyMonths',
        'notes',
      ]);
      for (const appointment of api.creates[0].draft.content.appointments) {
        expect(appointment).not.toHaveProperty('sourceProjectNumbers');
        expect(appointment).not.toHaveProperty('projectNumbers');
        expect(appointment).not.toHaveProperty('fundingSourceIds');
      }
    } finally {
      route.cleanup();
    }
  });

  it('keeps chosen funding when returning to setup and does not add staff from later task imports', async () => {
    const api = setup();
    const route = renderPlan(portfolioPath);
    const user = userEvent.setup();
    try {
      await user.click(await screen.findByRole('button', { name: 'New plan' }));
      await user.type(screen.getByLabelText('Plan name'), 'Chosen staff only');
      await user.type(
        await screen.findByRole('searchbox', {
          name: 'Search funding sources',
        }),
        'Task One'
      );
      await user.click(
        within(
          screen.getByRole('region', { name: 'Project A search results' })
        ).getByRole('button', { name: 'Add this task' })
      );
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await screen.findByRole('button', {
        name: 'Edit appointment for Alex Example',
      });
      await user.click(screen.getByRole('button', { name: 'Funding sources' }));
      expect(screen.getAllByRole('article')).toHaveLength(1);
      expect(
        screen.queryByRole('region', { name: 'Project B funding sources' })
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Edit .*Task T1.*Task One/ })
      ).toBeInTheDocument();
      await user.click(
        screen.getByRole('button', { name: 'Add funding source' })
      );
      const picker = screen.getByRole('dialog', { name: 'Add funding source' });
      await user.type(
        await within(picker).findByRole('searchbox', {
          name: 'Search funding sources',
        }),
        'Task Two'
      );
      await user.click(
        within(picker).getByRole('button', { name: 'Add this task' })
      );
      await user.click(
        within(picker).getByRole('button', { name: 'Change tasks' })
      );
      const taskDialog = screen.getByRole('dialog', {
        name: 'Change tasks for Project A',
      });
      await user.click(
        within(taskDialog).getByRole('button', { name: 'Clear all' })
      );
      // jsdom does not perform Escape's native dialog cancellation.
      fireEvent(
        taskDialog,
        new Event('cancel', { bubbles: false, cancelable: true })
      );
      expect(
        screen.queryByRole('dialog', { name: 'Change tasks for Project A' })
      ).not.toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'Add funding source' })).toBe(
        picker
      );
      expect(
        within(picker).getByText('1 funding source selected')
      ).toBeInTheDocument();
      await user.click(
        within(picker).getByRole('button', { name: 'Add selected sources' })
      );
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      );
      expect(screen.getAllByRole('article')).toHaveLength(2);
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      expect(
        screen.getByRole('button', {
          name: 'Edit appointment for Alex Example',
        })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', {
          name: 'Edit appointment for Blair Example',
        })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', {
          name: 'Edit appointment for Casey Example',
        })
      ).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.click(
        screen.getByRole('button', { name: 'Create plan & open workspace' })
      );
      await waitFor(() => expect(api.creates).toHaveLength(1));
      expect(
        api.creates[0].draft.content.fundingSources.map(
          ({ taskNumber }) => taskNumber
        )
      ).toEqual(['T1', 'T2']);
      expect(
        api.creates[0].draft.content.appointments.map(({ name }) => name)
      ).toEqual(['Alex Example']);
      expect(api.creates[0].draft.content.appointments[0].allocations).toEqual([
        api.plan.content.appointments[0].allocations[0],
      ]);
    } finally {
      route.cleanup();
    }
  });

  it('renames a task source without changing its captured parent project heading', async () => {
    const api = setup();
    const route = renderPlan(portfolioPath);
    const user = userEvent.setup();
    try {
      await user.click(await screen.findByRole('button', { name: 'New plan' }));
      await user.type(screen.getByLabelText('Plan name'), 'Renamed task plan');
      await chooseInitialProjects(user, ['Project A']);
      await user.click(
        screen.getByRole('button', { name: /Edit .*Task T1.*Task One/ })
      );
      await user.clear(screen.getByLabelText('Source name'));
      await user.type(screen.getByLabelText('Source name'), 'Field research');
      await user.click(screen.getByRole('button', { name: 'Apply' }));
      expect(
        screen.getByRole('region', { name: 'Project A selected funding' })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', {
          name: /Edit Field research.*Task T1/,
        })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('region', {
          name: 'Field research selected funding',
        })
      ).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.click(
        screen.getByRole('button', { name: 'Create plan & open workspace' })
      );
      await waitFor(() => expect(api.creates).toHaveLength(1));
      expect(api.creates[0].draft.content.fundingSources[0]).toMatchObject({
        name: 'Field research',
        projectName: 'Project A',
        projectNumber: 'PA',
        taskName: 'Task One',
        taskNumber: 'T1',
      });
    } finally {
      route.cleanup();
    }
  });

  it('applies source assumptions and saves them without changing captured figures or employee settings', async () => {
    const api = setup();
    const route = renderPlan();
    const user = userEvent.setup();
    try {
      await user.click(
        await screen.findByRole('button', { name: /Edit .*Task T1.*Task One/ })
      );
      await user.clear(screen.getByLabelText('Planning balance'));
      await user.type(screen.getByLabelText('Planning balance'), '50000');
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.getByRole('button', { name: 'Save plan' })).toBeDisabled();
      await user.click(
        screen.getByRole('button', { name: /Edit .*Task T1.*Task One/ })
      );
      await user.clear(screen.getByLabelText('Planning balance'));
      await user.type(screen.getByLabelText('Planning balance'), '50000');
      await user.clear(screen.getByLabelText('End date'));
      await user.type(screen.getByLabelText('End date'), '2026-09-30');
      await user.click(screen.getByRole('button', { name: 'Apply' }));
      await user.click(screen.getByRole('button', { name: 'Save plan' }));
      await waitFor(() => expect(api.saves).toHaveLength(1));
      expect(api.saves[0].expectedSeededAt).toBe(api.plan.seededAt);
      expect(api.saves[0].expectedUpdatedAt).toBe(api.plan.updatedAt);
      expect(api.saves[0].content.appointments).toEqual(
        api.plan.content.appointments
      );
      expect(api.saves[0].content.fundingSources[0]).toMatchObject({
        balanceAdjustment: 30_000,
        budgets: api.plan.content.fundingSources[0].budgets,
        capturedAt: api.plan.seededAt,
        capturedEndDate: '2026-06-30',
        endDate: '2026-09-30',
      });
    } finally {
      route.cleanup();
    }
  });

  it('removes allocations without outside replacement and re-adds fresh finances without restoring staffing or expenses', async () => {
    const api = setup();
    const route = renderPlan();
    const user = userEvent.setup();
    try {
      await user.click(
        await screen.findByRole('button', { name: /Remove .*Task T2/ })
      );
      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', {
          name: /Remove/,
        })
      );
      await user.click(screen.getByRole('button', { name: 'Save plan' }));
      await waitFor(() => expect(api.saves).toHaveLength(1));
      expect(api.saves[0].content.fundingSources.map(({ id }) => id)).toEqual([
        1, 3,
      ]);
      expect(api.saves[0].content.appointments).toHaveLength(3);
      expect(api.saves[0].content.appointments[0].allocations).toEqual([
        api.plan.content.appointments[0].allocations[0],
      ]);
      expect(api.saves[0].content.appointments[1].allocations).toEqual([]);

      await user.click(
        screen.getByRole('button', { name: 'Add funding source' })
      );
      await user.type(
        await within(
          screen.getByRole('dialog', { name: 'Add funding source' })
        ).findByRole('searchbox', {
          name: 'Search funding sources',
        }),
        'Task Two'
      );
      await user.click(
        within(
          screen.getByRole('region', { name: 'Project A search results' })
        ).getByRole('button', { name: 'Add this task' })
      );
      await user.click(
        screen.getByRole('button', { name: 'Add selected sources' })
      );
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      );
      await user.click(screen.getByRole('button', { name: 'Save plan' }));
      await waitFor(() => expect(api.saves).toHaveLength(2));
      expect(api.imports).toEqual([
        {
          sources: [{ projectNumber: 'PA', taskNumber: 'T2' }],
        },
      ]);
      expect(api.saves[1].content.appointments).toEqual(
        api.saves[0].content.appointments
      );
      const readded = api.saves[1].content.fundingSources.find(
        ({ taskNumber }) => taskNumber === 'T2'
      )!;
      expect(
        api.saves[0].content.fundingSources.map(({ id }) => id)
      ).not.toContain(readded.id);
      expect(readded).toMatchObject({
        budgets: api.fresh.budgets,
        capturedAt: api.fresh.capturedAt,
        expenses: [],
      });
      expect(api.saves[1].content.fundingSources[0]).toEqual(
        api.plan.content.fundingSources[0]
      );
    } finally {
      route.cleanup();
    }
  });

  it('protects unapplied source input when leaving the saved workspace', async () => {
    setup();
    const route = renderPlan();
    const user = userEvent.setup();
    try {
      await user.click(
        await screen.findByRole('button', { name: /Edit .*Task T1.*Task One/ })
      );
      await user.clear(screen.getByLabelText('Planning balance'));
      await user.type(screen.getByLabelText('Planning balance'), '55000');
      await act(async () => {
        void route.router.navigate({ to: '/help' });
      });
      const dialog = await screen.findByRole('dialog', { name: /Leave/ });
      await user.click(within(dialog).getByRole('button', { name: 'Stay' }));
      expect(screen.getByLabelText('Planning balance')).toHaveValue('55000');
      expect(route.router.state.location.pathname).toBe(portfolioPath + '/1');
    } finally {
      route.cleanup();
    }
  });
});
