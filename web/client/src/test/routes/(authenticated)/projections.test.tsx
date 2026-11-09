import { act, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  createSalaryExample,
  createAppointmentLookupsExample,
} from '@/dev/projections/fixture.ts';
import type { Projection } from '@/queries/projections.ts';
import { server } from '@/test/mswUtils.ts';
import { renderRoute } from '@/test/routerUtils.tsx';

function handlePlan(plan: Projection, listed = true) {
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
    http.get('/api/projections/by-iam/:iamId', () =>
      HttpResponse.json(listed ? [plan] : [])
    ),
    http.get('/api/projections/:id', () => HttpResponse.json(plan))
  );
}

const salaryInput = () =>
  screen.getByRole('textbox', { name: 'Full-time annual salary' });

describe('saved projection route', () => {
  it('preserves edits through query refresh and navigation, then saves exact versions through the real mutation', async () => {
    const plan = createSalaryExample();
    plan.updatedAt = '2026-01-02T12:34:56.1234567Z';
    plan.seededAt = '2026-01-01T00:00:00.1234567Z';
    for (const source of plan.content.fundingSources) {
      source.capturedAt = plan.seededAt;
    }
    handlePlan(plan);
    const requests: Record<string, unknown>[] = [];
    const savedVersion = '2026-01-03T12:34:56.7654321Z';
    server.use(
      http.put('/api/projections/:id', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        requests.push(body);
        return HttpResponse.json({
          ...plan,
          content: body.content,
          name: body.name,
          updatedAt: savedVersion,
          updatedBy: 'preview-user',
        });
      })
    );
    const user = userEvent.setup();
    const route = renderRoute({
      initialPath: `/projections/IAM-PREVIEW/${plan.id}?section=staffing&appointment=101`,
    });
    try {
      await screen.findByRole('dialog');
      await screen.findByRole('textbox', { name: 'Full-time annual salary' });
      await user.clear(salaryInput());
      await user.type(salaryInput(), '132000');
      await user.click(screen.getByRole('button', { name: 'Apply' }));

      // An unavailable membership lookup must not interrupt an already-open draft.
      let membershipReads = 0;
      server.use(
        http.get('/api/projections/by-iam/:iamId', () => {
          membershipReads++;
          return new HttpResponse(null, { status: 500 });
        })
      );
      route.queryClient.removeQueries({
        queryKey: ['projections', 'by-iam', 'IAM-PREVIEW'],
      });

      const refreshed = structuredClone(plan);
      refreshed.content.appointments[0].monthlySalary = 12_000;
      refreshed.updatedAt = '2026-01-02T18:00:00.0000001Z';
      await act(async () => {
        route.queryClient.setQueryData(['projections', plan.id], refreshed);
      });
      await user.click(screen.getByRole('button', { name: 'Funding outlook' }));
      await user.click(screen.getByRole('button', { name: 'Staffing' }));
      expect(membershipReads).toBe(0);
      await user.click(
        screen.getByRole('button', {
          name: 'Edit appointment for Alex Example',
        })
      );
      expect(salaryInput()).toHaveValue('132000.00');
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      await user.click(screen.getByRole('button', { name: /^Save plan/ }));
      await waitFor(() => expect(requests).toHaveLength(1));
      expect(requests[0]).toEqual({
        content: {
          appointments: [
            { ...plan.content.appointments[0], monthlySalary: 11_000 },
          ],
          forecastMonths: plan.content.forecastMonths,
          fundingSources: plan.content.fundingSources,
          historyMonths: plan.content.historyMonths,
          notes: plan.content.notes,
        },
        expectedSeededAt: plan.seededAt,
        expectedUpdatedAt: plan.updatedAt,
        name: plan.name,
        overwrite: false,
      });
      await waitFor(() =>
        expect(
          route.queryClient.getQueryData<Projection>(['projections', plan.id])
            ?.updatedAt
        ).toBe(savedVersion)
      );

      await user.click(
        screen.getByRole('button', {
          name: 'Edit appointment for Alex Example',
        })
      );
      await user.clear(salaryInput());
      await user.type(salaryInput(), '156000');
      await user.click(screen.getByRole('button', { name: 'Apply' }));
      await user.click(screen.getByRole('button', { name: /^Save plan/ }));
      await waitFor(() => expect(requests).toHaveLength(2));
      expect(requests[1]).toMatchObject({
        content: { appointments: [{ monthlySalary: 13_000 }] },
        expectedSeededAt: plan.seededAt,
        expectedUpdatedAt: savedVersion,
        overwrite: false,
      });
      await screen.findByRole('button', { name: '✓ Saved' });
      await user.click(screen.getByRole('link', { name: 'Help' }));
      const latest = structuredClone(plan);
      latest.content.appointments[0].monthlySalary = 15_000;
      latest.updatedAt = '2026-01-04T12:34:56.7654321Z';
      handlePlan(latest);
      await act(async () => {
        await route.router.navigate({
          params: { iamId: 'IAM-PREVIEW', projectionId: String(plan.id) },
          search: { section: 'staffing' },
          to: '/projections/$iamId/$projectionId',
        });
      });
      expect(
        await screen.findByText('$180,000.00 per year at full time')
      ).toBeInTheDocument();
    } finally {
      route.cleanup();
    }
  });

  it('does not show an accessible plan under a different PI address', async () => {
    const plan = createSalaryExample();
    handlePlan(plan, false);
    const route = renderRoute({
      initialPath: `/projections/OTHER-IAM/${plan.id}?section=staffing`,
    });
    try {
      await screen.findByRole('alert');
      expect(
        screen.queryByRole('button', {
          name: 'Edit appointment for Alex Example',
        })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /^Save plan/ })
      ).not.toBeInTheDocument();
    } finally {
      route.cleanup();
    }
  });
});
