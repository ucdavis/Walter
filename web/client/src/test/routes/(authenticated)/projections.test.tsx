import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
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
  projects: [],
  seededAt: '2026-10-29T12:00:00Z',
  updatedAt: '2026-10-29T12:00:00Z',
  updatedBy: null,
};

function mockSavedProjections() {
  server.use(
    http.get(`/api/projections/by-iam/${DEMO_IAM_ID}`, () =>
      HttpResponse.json([projection])
    ),
    http.get('/api/projections/12', () => HttpResponse.json(projection)),
    ...createDemoHandlers(createDemoData(42, '2026-10'))
  );
}

describe('saved projection routes outside demo mode', () => {
  it('opens the saved list and navigates to a plan without the demo gate', async () => {
    mockSavedProjections();
    const { cleanup } = renderRoute({
      initialPath: `/projections/${DEMO_IAM_ID}`,
    });
    try {
      const planLink = await screen.findByRole('link', {
        name: projection.name,
      });
      expect(planLink).toHaveAttribute(
        'href',
        `/projections/${DEMO_IAM_ID}/12`
      );
      expect(
        screen.getByRole('heading', { name: 'New projection' })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: 'ProjectionLab' })
      ).not.toBeInTheDocument();
      await userEvent.click(planLink);
      expect(
        await screen.findByRole('heading', { name: projection.name })
      ).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('opens a saved plan directly', async () => {
    mockSavedProjections();
    const { cleanup } = renderRoute({
      initialPath: `/projections/${DEMO_IAM_ID}/12`,
    });
    try {
      expect(
        await screen.findByRole('heading', { name: projection.name })
      ).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });
});
