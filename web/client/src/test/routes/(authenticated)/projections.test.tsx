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
  it.each(['?plan=default', '/12'])(
    'restores projects and sections with Back and Forward at %s',
    async (suffix) => {
      mockSavedProjections();
      const view = renderRoute({
        initialPath: `/projections/${DEMO_IAM_ID}${suffix}`,
      });
      try {
        await screen.findByRole('heading', { name: 'Your plan at a glance' });
        fireEvent.click(
          within(
            screen.getByRole('region', { name: 'Overview editor' })
          ).getByRole('button', { name: /Real seed project/ })
        );
        await screen.findByRole('button', { name: 'Back to all projects' });
        expect(view.router.state.location.search.project).toBe('project-7');
        await section('Staffing');
        await act(async () => view.router.history.back());
        await screen.findByRole('heading', {
          level: 2,
          name: 'Real seed project · Task 1',
        });
        await act(async () => view.router.history.back());
        await screen.findByRole('heading', { name: 'Your plan at a glance' });
        expect(screen.getByLabelText('Explore a project')).toHaveValue('');
        await act(async () => view.router.history.forward());
        await screen.findByRole('heading', {
          level: 2,
          name: 'Real seed project · Task 1',
        });
        fireEvent.click(
          screen.getByRole('button', { name: 'Back to all projects' })
        );
        await screen.findByRole('heading', { name: 'Your plan at a glance' });
        expect(screen.getByLabelText('Explore a project')).toHaveValue('');
        fireEvent.change(screen.getByLabelText('Explore a project'), {
          target: { value: 'project-7' },
        });
        await screen.findByRole('heading', {
          level: 2,
          name: 'Real seed project · Task 1',
        });
        fireEvent.click(screen.getByRole('button', { name: 'All plans' }));
        await screen.findByRole('heading', { name: 'Portfolio projections' });
        await act(async () => view.router.history.back());
        await screen.findByRole('heading', {
          level: 2,
          name: 'Real seed project · Task 1',
        });
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
        level: 2,
        name: 'Real seed project · Task 1',
      });
      await section('Plan details');
      fireEvent.change(screen.getByLabelText('Plan name'), {
        target: { value: 'Keep these edits' },
      });
      await screen.findByText('Unsaved changes');
      await section('Funding');
      await act(async () => view.router.history.back());
      expect(await screen.findByLabelText('Plan name')).toHaveValue(
        'Keep these edits'
      );
      await act(async () => view.router.history.back());
      await screen.findByRole('heading', {
        level: 2,
        name: 'Real seed project · Task 1',
      });
      expect(confirm).not.toHaveBeenCalled();
      fireEvent.click(
        within(
          screen.getByRole('navigation', { name: 'Plan navigation' })
        ).getByRole('button', { name: /Default plan/ })
      );
      await screen.findByRole('heading', { name: 'Your plan at a glance' });
      expect(confirm).not.toHaveBeenCalled();
      await section('Plan details');
      expect(screen.getByLabelText('Plan name')).toHaveValue(
        'Keep these edits'
      );
      fireEvent.click(screen.getByRole('button', { name: 'All plans' }));
      expect(confirm).toHaveBeenCalledOnce();
      expect(screen.getByLabelText('Plan name')).toHaveValue(
        'Keep these edits'
      );
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
      fireEvent.click(screen.getByRole('button', { name: 'Save plan' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Could not save this plan'
      );
      expect(screen.getByLabelText('Plan name')).toHaveValue('Retry this plan');
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
      fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
      expect(confirm).toHaveBeenCalled();
      expect(screen.getByLabelText('Plan name')).toHaveValue('Keep editing');
      confirm.mockReturnValue(true);
      fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
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
      expect(
        screen.getByRole('button', { name: 'Create New Plan' })
      ).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Save plan' })).toBeEnabled();
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
