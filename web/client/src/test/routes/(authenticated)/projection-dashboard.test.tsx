import { act, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { createSalaryExample } from '@/test/fixtures/projections.ts';
import { SUPPLIES_CATEGORY } from '@/lib/piProjection.ts';
import type {
  Projection,
  ProjectionSourceSummary,
} from '@/queries/projections.ts';
import { server } from '@/test/mswUtils.ts';
import { renderRoute } from '@/test/routerUtils.tsx';

const listUrl = '/api/projections/by-iam/IAM-PREVIEW';

function example(id: number, name: string): Projection {
  const plan = createSalaryExample();
  plan.id = id;
  plan.name = name;
  plan.seededAt = '2026-01-16T00:00:00.1234567Z';
  plan.content.appointments = [];
  plan.content.notes = 'Saved scenario inputs';
  for (const source of plan.content.fundingSources) {
    source.capturedAt = plan.seededAt;
    source.startDate = null;
    source.endDate = null;
    source.balanceAdjustment = 0;
    source.actuals = [];
    source.runRates = [];
    source.expenses = [];
    source.historicalExpenseOverrides = [];
    source.budgets = [
      {
        budget: 1000,
        committed: 0,
        expenditureCategory: SUPPLIES_CATEGORY,
        spentToDate: 0,
      },
    ];
  }
  return plan;
}

function handleDashboard(plans: Projection[]) {
  server.use(
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
    http.get(listUrl, () =>
      HttpResponse.json(
        plans.map(({ id, name, seededAt, updatedAt, updatedBy }) => ({
          id,
          name,
          seededAt,
          updatedAt,
          updatedBy,
        }))
      )
    ),
    http.get(listUrl + '/sources', () => HttpResponse.json([])),
    http.get('/api/projections/:id', ({ params }) =>
      HttpResponse.json(plans.find((plan) => plan.id === Number(params.id)))
    )
  );
}

function openDashboard() {
  return renderRoute({ initialPath: '/projections/IAM-PREVIEW' });
}

describe('projection dashboard', () => {
  it('removes plan entry points when the flag turns off while viewing the dashboard', async () => {
    handleDashboard([example(71, 'Visible plan')]);
    const route = openDashboard();
    try {
      await screen.findByRole('article', { name: 'Visible plan' });
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
      await screen.findByText('Projections are not available.');
      expect(
        screen.queryByRole('button', { name: 'New plan' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('article', { name: 'Visible plan' })
      ).not.toBeInTheDocument();
    } finally {
      route.cleanup();
    }
  });

  it('follows an older in-flight preview with a fresh read when metadata advances, without refetching newer details', async () => {
    const original = example(71, 'Initial plan');
    original.updatedAt = '2026-11-09T22:00:00.12Z';
    const updated = structuredClone(original);
    updated.name = 'Latest plan';
    updated.updatedAt = '2026-11-09T22:00:00.1200002Z';
    updated.content.fundingSources[0].balanceAdjustment = 4000;
    handleDashboard([original]);
    let release!: () => void;
    let reads = 0;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get('/api/projections/71', async () => {
        reads++;
        if (reads === 1) {
          await held;
          return HttpResponse.json(original);
        }
        return HttpResponse.json(updated);
      })
    );
    const route = openDashboard();
    try {
      await waitFor(() => expect(reads).toBe(1));
      await act(async () => {
        route.queryClient.setQueryData(
          ['projections', 'by-iam', 'IAM-PREVIEW'],
          [
            {
              ...original,
              name: 'Intermediate plan',
              updatedAt: '2026-11-09T22:00:00.1200001Z',
            },
          ]
        );
      });
      release();
      const card = await screen.findByRole('article', { name: 'Latest plan' });
      expect(await within(card).findByText('$6,000.00')).toBeInTheDocument();
      expect(reads).toBe(2);
      expect(
        route.queryClient.getQueryState(['projections', original.id])
          ?.isInvalidated
      ).toBe(false);
    } finally {
      release();
      route.cleanup();
    }
  });

  it('refreshes a mounted preview when the list discovers a newer saved version', async () => {
    const original = example(71, 'Original plan');
    handleDashboard([original]);
    const route = openDashboard();
    try {
      expect(await screen.findByText('$2,000.00')).toBeInTheDocument();
      const updated = structuredClone(original);
      updated.name = 'Revised plan';
      updated.updatedAt = '2026-11-09T22:00:00.1234567Z';
      updated.content.fundingSources[0].balanceAdjustment = 3000;
      server.use(
        http.get('/api/projections/71', () => HttpResponse.json(updated))
      );
      await act(async () => {
        route.queryClient.setQueryData(
          ['projections', 'by-iam', 'IAM-PREVIEW'],
          [
            {
              id: updated.id,
              name: updated.name,
              seededAt: updated.seededAt,
              updatedAt: updated.updatedAt,
              updatedBy: updated.updatedBy,
            },
          ]
        );
      });
      const card = await screen.findByRole('article', { name: 'Revised plan' });
      expect(await within(card).findByText('$5,000.00')).toBeInTheDocument();
      expect(
        screen.queryByRole('article', { name: 'Original plan' })
      ).not.toBeInTheDocument();
    } finally {
      route.cleanup();
    }
  });

  it('keeps cards and New plan usable while balances and another preview are delayed or fail', async () => {
    handleDashboard([
      example(71, 'Ready plan'),
      example(72, 'Slow plan'),
      example(73, 'Unavailable plan'),
    ]);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get(listUrl + '/sources', async () => {
        await held;
        return new HttpResponse(null, { status: 500 });
      }),
      http.get('/api/projections/72', async () => {
        await held;
        return HttpResponse.json(example(72, 'Slow plan'));
      }),
      http.get(
        '/api/projections/73',
        () => new HttpResponse(null, { status: 500 })
      )
    );
    const route = openDashboard();
    try {
      const ready = await screen.findByRole('article', { name: 'Ready plan' });
      expect(await within(ready).findByText('$2,000.00')).toBeInTheDocument();
      expect(
        within(screen.getByRole('article', { name: 'Slow plan' })).getByText(
          'Loading preview...'
        )
      ).toBeInTheDocument();
      expect(
        await within(
          screen.getByRole('article', { name: 'Unavailable plan' })
        ).findByText('Preview unavailable.')
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'New plan' })).toBeEnabled();
      expect(
        screen.getByRole('link', { name: 'Open plan Slow plan' })
      ).toHaveAttribute('href', '/projections/IAM-PREVIEW/72');
      release();
      expect(
        await screen.findByText('Current balances are unavailable.')
      ).toBeInTheDocument();
      expect(
        await within(
          screen.getByRole('article', { name: 'Slow plan' })
        ).findByText('$2,000.00')
      ).toBeInTheDocument();
    } finally {
      release();
      route.cleanup();
    }
  });

  it('keeps current project/task balances separate from saved forecasts, with the breakdown collapsed', async () => {
    handleDashboard([example(71, 'Captured plan')]);
    const sources: ProjectionSourceSummary[] = [
      {
        availableBalance: -100,
        capturedAt: '2026-11-09T12:00:00.1234567Z',
        projectName: 'Field study',
        projectNumber: 'P1',
        taskName: 'Fieldwork',
        taskNumber: 'T1',
      },
      {
        availableBalance: 500,
        capturedAt: '2026-11-09T12:00:00.1234567Z',
        projectName: 'Field study',
        projectNumber: 'P1',
        taskName: 'Analysis',
        taskNumber: 'T2',
      },
      {
        availableBalance: 200,
        capturedAt: '2026-11-09T12:00:00.1234567Z',
        projectName: 'Teaching',
        projectNumber: 'P2',
        taskName: null,
        taskNumber: 'T1',
      },
    ];
    let seedReads = 0;
    let writes = 0;
    server.use(
      http.get(listUrl + '/sources', () => HttpResponse.json(sources)),
      http.get(listUrl + '/seed', () => {
        seedReads++;
        return new HttpResponse(null, { status: 500 });
      }),
      http.post(listUrl, () => {
        writes++;
        return new HttpResponse(null, { status: 500 });
      })
    );
    const route = openDashboard();
    try {
      const current = await screen.findByRole('region', {
        name: 'Current project balances',
      });
      expect(await within(current).findByText('$600.00')).toBeInTheDocument();
      expect(current.querySelector('details')).not.toHaveAttribute('open');
      await userEvent
        .setup()
        .click(within(current).getByText('Project balances (2)'));
      expect(current.querySelector('details')).toHaveAttribute('open');
      expect(within(current).getByText('$400.00')).toBeVisible();
      expect(within(current).getByText('-$100.00')).toBeVisible();
      expect(within(current).getByText('Fieldwork T1')).toBeVisible();
      expect(
        await within(
          screen.getByRole('article', { name: 'Captured plan' })
        ).findByText('$2,000.00')
      ).toBeInTheDocument();
      expect(seedReads).toBe(0);
      expect(writes).toBe(0);
    } finally {
      route.cleanup();
    }
  });

  it('keeps the ending total without card warnings and never invents a zero forecast', async () => {
    const recovered = example(71, 'Recovered shortfall');
    recovered.content.fundingSources[0].expenses = [
      {
        amount: 1200,
        description: 'Purchase',
        endMonth: null,
        expenditureCategory: SUPPLIES_CATEGORY,
        id: 1,
        kind: 'OneTime',
        startMonth: '2026-02-01',
      },
      {
        amount: -500,
        description: 'Credit',
        endMonth: null,
        expenditureCategory: SUPPLIES_CATEGORY,
        id: 2,
        kind: 'OneTime',
        startMonth: '2026-03-01',
      },
    ];
    const outside = example(72, 'Outside period');
    outside.content.fundingSources.forEach((source) => {
      source.startDate = '2028-01-01';
    });
    handleDashboard([recovered, outside]);
    const route = openDashboard();
    try {
      const card = await screen.findByRole('article', {
        name: 'Recovered shortfall',
      });
      expect(await within(card).findByText('$1,300.00')).toBeInTheDocument();
      expect(
        within(card).queryByText(/falls below zero/)
      ).not.toBeInTheDocument();
      expect(
        within(card).queryByRole('button', { name: /Duplicate/ })
      ).not.toBeInTheDocument();
      const absent = screen.getByRole('article', { name: 'Outside period' });
      expect(
        await within(absent).findByText('No forecast data')
      ).toBeInTheDocument();
      expect(within(absent).queryByText('$0.00')).not.toBeInTheDocument();
      expect(within(absent).queryByRole('img')).not.toBeInTheDocument();
    } finally {
      route.cleanup();
    }
  });

  it('shows a count, real forecast durations and appointments, with one keyboard-operable card link', async () => {
    const short = example(71, 'Twelve month plan');
    const long = example(72, 'Eighteen month plan');
    short.content.forecastMonths = 12;
    long.content.forecastMonths = 18;
    long.content.appointments = createSalaryExample().content.appointments;
    handleDashboard([short, long]);
    const route = openDashboard();
    const user = userEvent.setup();
    try {
      expect(
        await screen.findByRole('heading', { name: 'Your plans' })
      ).toBeInTheDocument();
      expect(screen.getByLabelText('2 plans')).toHaveTextContent('2');
      const shortCard = screen.getByRole('article', { name: short.name });
      const longCard = screen.getByRole('article', { name: long.name });
      expect(
        await within(shortCard).findByText('12 months · 0 appointments')
      ).toBeInTheDocument();
      expect(
        await within(longCard).findByText('18 months · 1 appointment')
      ).toBeInTheDocument();
      expect(within(shortCard).getAllByRole('link')).toHaveLength(1);
      const graph = within(shortCard).getByRole('img');
      const ending = within(shortCard).getByText('Ending balance');
      expect(
        graph.compareDocumentPosition(ending) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      expect(graph.querySelector('line')).toHaveAttribute(
        'stroke-dasharray',
        '4 4'
      );
      const link = within(shortCard).getByRole('link', {
        name: `Open plan ${short.name}`,
      });
      expect(link).toHaveAttribute('href', '/projections/IAM-PREVIEW/71');
      expect(link).toHaveClass('after:inset-0');
      link.focus();
      await user.keyboard('{Enter}');
      await waitFor(() =>
        expect(route.router.state.location.pathname).toBe(
          '/projections/IAM-PREVIEW/71'
        )
      );
    } finally {
      route.cleanup();
    }
  });

  it('retries failed previews and balances without recreating or opening a plan', async () => {
    const plan = example(71, 'Retry plan');
    handleDashboard([plan]);
    let planReads = 0;
    let balanceReads = 0;
    server.use(
      http.get('/api/projections/71', () =>
        ++planReads === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json(plan)
      ),
      http.get(listUrl + '/sources', () =>
        ++balanceReads === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json([])
      )
    );
    const route = openDashboard();
    const user = userEvent.setup();
    try {
      const retry = await screen.findByRole('button', {
        name: 'Retry preview',
      });
      expect(retry.closest('a')).toBeNull();
      await user.click(retry);
      await user.click(
        await screen.findByRole('button', { name: 'Retry balances' })
      );
      expect(await screen.findByText('$2,000.00')).toBeInTheDocument();
      expect(
        await screen.findByText('No eligible project balances are available.')
      ).toBeInTheDocument();
      await waitFor(() => expect(planReads).toBe(2));
      expect(balanceReads).toBe(2);
      expect(route.router.state.location.pathname).toBe(
        '/projections/IAM-PREVIEW'
      );
    } finally {
      route.cleanup();
    }
  });
});
