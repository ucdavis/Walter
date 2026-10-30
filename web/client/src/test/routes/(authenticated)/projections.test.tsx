import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createDemoData, DEMO_IAM_ID } from '@/demo/data.ts';
import { createDemoHandlers } from '@/demo/handlers.ts';
import type { Projection } from '@/queries/projections.ts';
import { server } from '@/test/mswUtils.ts';
import { renderRoute } from '@/test/routerUtils.tsx';

const projection: Projection = {
  createdAt: '2026-10-29T12:00:00Z',
  createdBy: null,
  historyMonths: 3,
  id: 12,
  jobs: [],
  name: 'Saved staffing plan',
  piEmployeeId: 'DEMO-PI',
  projects: [
    {
      actuals: [],
      awardName: null,
      awardNumber: null,
      budgets: [
        {
          budget: 150_000,
          committed: 5000,
          expenditureCategory: 'Supplies',
          isSeeded: true,
          spentToDate: 25_000,
        },
      ],
      endDate: '2027-12-31',
      expenses: [
        {
          amount: 100,
          description: null,
          endMonth: null,
          expenditureCategory: 'Supplies',
          kind: 'Projected',
          startMonth: null,
        },
      ],
      id: 7,
      isSeeded: true,
      projectName: 'Real seed project',
      projectNumber: 'PPM123',
      projectType: 'Sponsored',
      runRates: [
        {
          expenditureCategory: 'Supplies',
          historyMonths: 3,
          monthlyAmount: 100,
        },
        {
          expenditureCategory: 'Supplies',
          historyMonths: 6,
          monthlyAmount: 250,
        },
      ],
      startDate: '2025-01-01',
      taskName: 'Research',
      taskNumber: '1',
    },
  ],
  seededAt: '2026-10-29T12:00:00Z',
  updatedAt: '2026-10-29T12:00:00Z',
  updatedBy: null,
};
let saved: Projection[];
let writes: Array<{ body: Record<string, unknown>; method: string }>;
let failSave: boolean;
beforeEach(() => {
  saved = [structuredClone(projection)];
  writes = [];
  failSave = false;
});

function mockSavedProjections() {
  server.use(
    http.get(`/api/project/by-iam/${DEMO_IAM_ID}`, () =>
      HttpResponse.json([
        {
          awardEndDate: null,
          projectNumber: 'PPM123',
          projectType: 'Sponsored',
          taskNum: '1',
          taskStatus: 'Active',
        },
      ])
    ),
    http.get(`/api/projections/by-iam/${DEMO_IAM_ID}/seed`, () =>
      HttpResponse.json({ ...projection, id: 0, name: 'Default plan' })
    ),
    http.get(`/api/projections/by-iam/${DEMO_IAM_ID}`, () =>
      HttpResponse.json(saved)
    ),
    http.get('/api/projections/lookups', () =>
      HttpResponse.json({ expenditureCategories: ['Supplies'], jobCodes: [] })
    ),
    http.get('/api/projections/:id', ({ params }) =>
      HttpResponse.json(saved.find((p) => p.id === Number(params.id)))
    ),
    http.put('/api/projections/:id', async ({ params, request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      writes.push({ body, method: 'PUT' });
      if (failSave) {
        return new HttpResponse('Save unavailable', { status: 500 });
      }
      const index = saved.findIndex((p) => p.id === Number(params.id));
      saved[index] = { ...saved[index], ...body };
      return HttpResponse.json(saved[index]);
    }),
    http.post(`/api/projections/by-iam/${DEMO_IAM_ID}`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      writes.push({ body, method: 'POST' });
      const created = {
        ...projection,
        ...(body.draft as object),
        historyMonths: body.historyMonths as number,
        id: 13,
        name: body.name as string,
      };
      saved.push(created);
      return HttpResponse.json(created);
    }),
    ...createDemoHandlers(createDemoData(42, '2026-10'))
  );
}
async function section(name: string) {
  if (name === 'Plan details') {
    fireEvent.click(screen.getByRole('button', { name }));
    await screen.findByRole('dialog', { name: 'Plan details' });
    return;
  }
  fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Plan sections' })).getByRole(
      'button',
      { name }
    )
  );
  await waitFor(() =>
    expect(
      within(
        screen.getByRole('navigation', { name: 'Plan sections' })
      ).getByRole('button', { name })
    ).toHaveAttribute('aria-current', 'page')
  );
}
function openSaved() {
  fireEvent.click(
    within(
      screen.getByRole('navigation', { name: 'Plan navigation' })
    ).getByRole('button', { name: /Saved staffing plan/ })
  );
}

describe('guided projections with server persistence', () => {
  it('saves only eligible projects, combining their tasks into one snapshot row', async () => {
    mockSavedProjections();
    saved = [];
    const tasks = [7, 8, 9, 10].map((id) => ({
      ...structuredClone(projection.projects[0]),
      id,
      projectNumber: id === 10 ? 'EXPIRED' : 'PPM123',
      projectType: id === 10 ? 'Sponsored' : 'Internal',
      taskNumber: String(id),
    }));
    server.use(
      http.get(`/api/projections/by-iam/${DEMO_IAM_ID}/seed`, () =>
        HttpResponse.json({
          ...projection,
          id: 0,
          name: 'Default plan',
          projects: tasks,
        })
      ),
      http.get(`/api/project/by-iam/${DEMO_IAM_ID}`, () =>
        HttpResponse.json(
          tasks.map((task) => ({
            awardEndDate: task.id === 10 ? '2000-01-01' : null,
            projectNumber: task.projectNumber,
            projectType: task.projectType,
            taskNum: task.taskNumber,
            taskStatus: task.id === 9 ? 'Inactive' : 'Active',
          }))
        )
      )
    );
    const view = renderRoute({
      initialPath: `/projections/${DEMO_IAM_ID}?plan=default`,
    });
    try {
      await screen.findByRole('region', { name: 'Live project outlook' });
      expect(
        within(screen.getByLabelText('Explore a project')).getAllByRole(
          'option'
        )
      ).toHaveLength(2);
      fireEvent.click(screen.getByRole('button', { name: 'Save plan' }));
      await screen.findByText('Saved in Walter');
      expect(saved[0].projects).toHaveLength(1);
      expect(saved[0].projects[0]).toMatchObject({
        projectNumber: 'PPM123',
        taskNumber: null,
      });
      expect(saved[0].projects[0].budgets[0].budget).toBe(300_000);
      expect(saved[0].projects[0].expenses[0].amount).toBe(200);
      expect(saved[0].settings?.selectedProjectIds).toEqual([7]);
      expect(writes).toHaveLength(1);
    } finally {
      view.cleanup();
    }
  });

  it('keeps saved plans but disables fresh plans when dashboard filters cannot be loaded', async () => {
    mockSavedProjections();
    server.use(
      http.get(
        `/api/project/by-iam/${DEMO_IAM_ID}`,
        () => new HttpResponse(null, { status: 503 })
      )
    );
    const view = renderRoute({ initialPath: `/projections/${DEMO_IAM_ID}/12` });
    try {
      await screen.findByRole('heading', { name: projection.name });
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Current portfolio data could not be loaded'
      );
      fireEvent.click(screen.getByRole('button', { name: 'All plans' }));
      await screen.findByRole('heading', { name: 'Portfolio projections' });
      expect(
        screen.getByRole('button', { name: 'Create New Plan' })
      ).toBeDisabled();
      expect(writes).toEqual([]);
    } finally {
      view.cleanup();
    }
  });

  it.each(['?plan=default', '/12'])(
    'restores projects and sections with Back and Forward at %s',
    async (suffix) => {
      mockSavedProjections();
      const view = renderRoute({
        initialPath: `/projections/${DEMO_IAM_ID}${suffix}`,
      });
      try {
        await screen.findByRole('region', { name: 'Live project outlook' });
        fireEvent.change(screen.getByLabelText('Explore a project'), {
          target: { value: 'project-7' },
        });
        await screen.findByRole('button', { name: 'Back to all projects' });
        expect(view.router.state.location.search.project).toBe('project-7');
        await section('Staffing');
        await act(async () => view.router.history.back());
        await screen.findByRole('heading', {
          level: 3,
          name: /Real seed project/,
        });
        await act(async () => view.router.history.back());
        await screen.findByRole('region', { name: 'Live project outlook' });
        expect(screen.getByLabelText('Explore a project')).toHaveValue('');
        await act(async () => view.router.history.forward());
        await screen.findByRole('heading', {
          level: 3,
          name: /Real seed project/,
        });
        fireEvent.click(
          screen.getByRole('button', { name: 'Back to all projects' })
        );
        await screen.findByRole('region', { name: 'Live project outlook' });
        expect(screen.getByLabelText('Explore a project')).toHaveValue('');
        fireEvent.change(screen.getByLabelText('Explore a project'), {
          target: { value: 'project-7' },
        });
        await screen.findByRole('heading', {
          level: 3,
          name: /Real seed project/,
        });
        fireEvent.click(screen.getByRole('button', { name: 'All plans' }));
        await screen.findByRole('heading', { name: 'Portfolio projections' });
        await act(async () => view.router.history.back());
        await screen.findByRole('heading', {
          level: 3,
          name: /Real seed project/,
        });
        expect(writes).toEqual([]);
      } finally {
        view.cleanup();
      }
    }
  );

  it.each(['Funding', 'Expenses'])(
    'keeps the %s tab active when changing project focus',
    async (name) => {
      mockSavedProjections();
      const view = renderRoute({
        initialPath: `/projections/${DEMO_IAM_ID}/12`,
      });
      try {
        await screen.findByRole('region', { name: 'Live project outlook' });
        await section(name);
        for (const project of ['project-7', '']) {
          fireEvent.change(screen.getByLabelText('Explore a project'), {
            target: { value: project },
          });
          await waitFor(() =>
            expect(screen.getByLabelText('Explore a project')).toHaveValue(
              project
            )
          );
          expect(
            within(
              screen.getByRole('navigation', { name: 'Plan sections' })
            ).getByRole('button', { name })
          ).toHaveAttribute('aria-current', 'page');
          expect(
            screen.getByRole('region', { name: `${name} editor` })
          ).toBeInTheDocument();
        }
        expect(writes).toEqual([]);
      } finally {
        view.cleanup();
      }
    }
  );

  it('opens a project deep link and keeps edits during view history navigation', async () => {
    mockSavedProjections();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const view = renderRoute({
      initialPath: `/projections/${DEMO_IAM_ID}?plan=default&project=project-7`,
    });
    try {
      await screen.findByRole('heading', {
        level: 3,
        name: /Real seed project/,
      });
      await section('Plan details');
      fireEvent.change(screen.getByLabelText('Plan name'), {
        target: { value: 'Keep these edits' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      await screen.findByText('Unsaved changes');
      await section('Funding');
      await act(async () => view.router.history.back());
      await screen.findByRole('heading', {
        level: 3,
        name: /Real seed project/,
      });
      await act(async () => view.router.history.back());
      expect(await screen.findByLabelText('Plan name')).toHaveValue(
        'Keep these edits'
      );
      await act(async () => view.router.history.back());
      await screen.findByRole('heading', {
        level: 3,
        name: /Real seed project/,
      });
      expect(confirm).not.toHaveBeenCalled();
      await section('Overview');
      await screen.findByRole('region', { name: 'Live project outlook' });
      expect(confirm).not.toHaveBeenCalled();
      await section('Plan details');
      expect(screen.getByLabelText('Plan name')).toHaveValue(
        'Keep these edits'
      );
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      fireEvent.click(screen.getByRole('button', { name: 'All plans' }));
      expect(confirm).toHaveBeenCalledOnce();
      expect(
        screen.getByRole('heading', { level: 1, name: 'Keep these edits' })
      ).toBeInTheDocument();
      expect(writes).toEqual([]);
    } finally {
      view.cleanup();
      confirm.mockRestore();
    }
  });

  it.each(['projections', 'guided-projections'])(
    'loads real seed data and saved plans at /%s without writes or browser storage',
    async (path) => {
      mockSavedProjections();
      const storage = vi.spyOn(Storage.prototype, 'setItem');
      const view = renderRoute({ initialPath: `/${path}/${DEMO_IAM_ID}` });
      try {
        await screen.findByRole('heading', { name: 'Portfolio projections' });
        expect(screen.getAllByText('Real seed project').length).toBeGreaterThan(
          0
        );
        expect(screen.getByText('$120,000')).toBeInTheDocument();
        openSaved();
        expect(
          screen.getByRole('heading', { name: projection.name })
        ).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: 'Save plan' })
        ).toBeInTheDocument();
        expect(writes).toEqual([]);
        expect(storage).not.toHaveBeenCalled();
      } finally {
        view.cleanup();
        storage.mockRestore();
      }
    }
  );

  it('saves edits through PUT and restores settings when reopened', async () => {
    mockSavedProjections();
    let view = renderRoute({ initialPath: `/projections/${DEMO_IAM_ID}/12` });
    try {
      await screen.findByRole('heading', { name: projection.name });
      await section('Plan details');
      fireEvent.change(screen.getByLabelText('Plan name'), {
        target: { value: 'Revised forecast' },
      });
      fireEvent.change(screen.getByLabelText('Planning period'), {
        target: { value: '18' },
      });
      fireEvent.change(
        screen.getByPlaceholderText(
          'For example, supplies for next field season'
        ),
        { target: { value: 'Fieldwork budget' } }
      );
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Save plan' }));
      await screen.findByText('Saved in Walter');
      expect(writes[0].method).toBe('PUT');
      expect(saved[0].settings).toMatchObject({
        months: 18,
        note: 'Fieldwork budget',
        selectedProjectIds: [7],
      });
      expect(saved[0].projects[0].budgets).toEqual(
        projection.projects[0].budgets
      );
      view.cleanup();
      view = renderRoute({ initialPath: `/projections/${DEMO_IAM_ID}/12` });
      await screen.findByRole('heading', { name: 'Revised forecast' });
      await section('Plan details');
      expect(screen.getByLabelText('Planning period')).toHaveValue('18');
      expect(
        screen.getByPlaceholderText(
          'For example, supplies for next field season'
        )
      ).toHaveValue('Fieldwork budget');
    } finally {
      view.cleanup();
    }
  });

  it('keeps a failed save editable and retries the same plan', async () => {
    mockSavedProjections();
    failSave = true;
    const view = renderRoute({ initialPath: `/projections/${DEMO_IAM_ID}/12` });
    try {
      await screen.findByRole('heading', { name: projection.name });
      await section('Plan details');
      fireEvent.change(screen.getByLabelText('Plan name'), {
        target: { value: 'Retry this plan' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      fireEvent.click(screen.getByRole('button', { name: 'Save plan' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Could not save this plan'
      );
      expect(
        screen.getByRole('heading', { level: 1, name: 'Retry this plan' })
      ).toBeInTheDocument();
      expect(saved[0].name).toBe(projection.name);
      failSave = false;
      fireEvent.click(screen.getByRole('button', { name: 'Save plan' }));
      await screen.findByText('Saved in Walter');
      expect(saved).toHaveLength(1);
      expect(saved[0].name).toBe('Retry this plan');
    } finally {
      view.cleanup();
    }
  });

  it('duplicates the edited snapshot without refreshing its dates or overwriting the original', async () => {
    mockSavedProjections();
    const view = renderRoute({ initialPath: `/projections/${DEMO_IAM_ID}/12` });
    try {
      await screen.findByRole('heading', { name: projection.name });
      fireEvent.click(screen.getByRole('button', { name: 'Duplicate plan' }));
      await screen.findByRole('heading', { name: `${projection.name} copy` });
      await waitFor(() =>
        expect(view.router.state.location.pathname).toBe(
          `/projections/${DEMO_IAM_ID}/13`
        )
      );
      expect(writes[0].method).toBe('POST');
      expect(saved).toHaveLength(2);
      expect(saved[1].seededAt).toBe(projection.seededAt);
      expect(saved[1].projects[0].runRates).toEqual(
        projection.projects[0].runRates
      );
      expect(saved[0]).toEqual(projection);
    } finally {
      view.cleanup();
    }
  });

  it('saves a reviewed new plan using the seed snapshot', async () => {
    mockSavedProjections();
    const view = renderRoute({ initialPath: `/projections/${DEMO_IAM_ID}` });
    try {
      await screen.findByRole('heading', { name: 'Portfolio projections' });
      fireEvent.click(screen.getByRole('button', { name: 'New plan' }));
      for (let step = 0; step < 3; step++) {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      }
      expect(writes).toEqual([]);
      fireEvent.click(
        screen.getByRole('button', { name: 'Create plan & open workspace' })
      );
      await screen.findByRole('heading', { name: 'My next plan' });
      expect(saved[1].projects[0].projectNumber).toBe('PPM123');
      expect(writes[0].method).toBe('POST');
    } finally {
      view.cleanup();
    }
  });

  it('asks before discarding unsaved changes while switching plans', async () => {
    mockSavedProjections();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const view = renderRoute({ initialPath: `/projections/${DEMO_IAM_ID}/12` });
    try {
      await screen.findByRole('heading', { name: projection.name });
      await section('Plan details');
      fireEvent.change(screen.getByLabelText('Plan name'), {
        target: { value: 'Keep editing' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      fireEvent.click(screen.getByRole('button', { name: 'All plans' }));
      expect(confirm).toHaveBeenCalled();
      expect(
        screen.getByRole('heading', { level: 1, name: 'Keep editing' })
      ).toBeInTheDocument();
      confirm.mockReturnValue(true);
      fireEvent.click(screen.getByRole('button', { name: 'All plans' }));
      expect(
        screen.getByRole('heading', { name: 'Portfolio projections' })
      ).toBeInTheDocument();
    } finally {
      view.cleanup();
      confirm.mockRestore();
    }
  });

  it('opens saved plans when the fresh seed and lookups are unavailable', async () => {
    mockSavedProjections();
    server.use(
      http.get(
        `/api/projections/by-iam/${DEMO_IAM_ID}/seed`,
        () => new HttpResponse(null, { status: 503 })
      ),
      http.get(
        '/api/projections/lookups',
        () => new HttpResponse(null, { status: 503 })
      )
    );
    const view = renderRoute({ initialPath: `/projections/${DEMO_IAM_ID}/12` });
    try {
      await screen.findByRole('heading', { name: projection.name });
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Current portfolio data could not be loaded'
      );
      expect(screen.getByRole('button', { name: 'Save plan' })).toBeEnabled();
      fireEvent.click(screen.getByRole('button', { name: 'All plans' }));
      await screen.findByRole('heading', { name: 'Portfolio projections' });
      expect(
        screen.getByRole('button', { name: 'Create New Plan' })
      ).toBeDisabled();
    } finally {
      view.cleanup();
    }
  });

  it('shows authorization errors without substituting demo records', async () => {
    mockSavedProjections();
    server.use(
      http.get(
        `/api/projections/by-iam/${DEMO_IAM_ID}`,
        () => new HttpResponse(null, { status: 403 })
      )
    );
    const view = renderRoute({
      initialPath: `/guided-projections/${DEMO_IAM_ID}`,
    });
    try {
      await screen.findByText('You do not have access to these projections');
      expect(
        screen.queryByRole('button', { name: 'New plan' })
      ).not.toBeInTheDocument();
      expect(writes).toEqual([]);
    } finally {
      view.cleanup();
    }
  });

  it('does not display a projection absent from the requested PI portfolio', async () => {
    mockSavedProjections();
    const view = renderRoute({ initialPath: `/projections/${DEMO_IAM_ID}/99` });
    try {
      await screen.findByText('Projection unavailable');
    } finally {
      view.cleanup();
    }
  });
});
