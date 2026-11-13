import { act, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { server } from '@/test/mswUtils.ts';
import { renderRoute } from '@/test/routerUtils.tsx';

function setup(roles: string[], enabled = true, hasManagedPis = true) {
  const managed = vi.fn(() =>
    HttpResponse.json({
      pis: hasManagedPis ? [
        { employeeId: '2', iamId: 'PI-2', name: 'Example PI', projectCount: 1 },
        {
          employeeId: '3',
          iamId: null,
          name: 'Missing Identity',
          projectCount: 0,
        },
      ] : [],
      projectManager: null,
    })
  );
  const projections = vi.fn(() => HttpResponse.json([]));
  server.use(
    http.get('/api/user/me', () =>
      HttpResponse.json({
        email: 'user@example.com',
        employeeId: '1',
        iamId: 'SELF',
        id: 'user-1',
        isEmulating: false,
        kerberos: 'user',
        name: 'User',
        roles,
      })
    ),
    http.get('/api/system/features', () =>
      HttpResponse.json({ projectionsEnabled: enabled })
    ),
    http.get('/api/project/managed/by-iam/:iamId', managed),
    http.get('/api/projections/by-iam/:iamId', projections),
    http.get('/api/projections/by-iam/:iamId/sources', () =>
      HttpResponse.json([])
    ),
    http.get('/api/project/by-iam/:iamId', () => HttpResponse.json([]))
  );
  return { managed, projections };
}

describe('projection navigation', () => {
  it.each(['FinancialViewer', 'ProjectManager'])(
    'offers the PI chooser for %s with production destinations',
    async (role) => {
      setup([role]);
      const route = renderRoute({ initialPath: '/projections' });
      try {
        expect(
          await screen.findByRole('link', { name: 'Example PI' })
        ).toHaveAttribute('href', '/projections/PI-2');
        expect(
          screen.getByRole('link', { name: 'View projections for Example PI' })
        ).toHaveAttribute('href', '/projections/PI-2');
        expect(
          screen.getByRole('link', { name: 'View projects for Example PI' })
        ).toHaveAttribute('href', '/projects/PI-2');
        expect(
          screen.queryByRole('link', { name: /Missing Identity/ })
        ).not.toBeInTheDocument();
        expect(
          screen.getByText('Campus identity unavailable')
        ).toBeInTheDocument();
        const globalLinks = screen.queryAllByRole('link', {
          name: 'Projections',
        });
        expect(globalLinks).toHaveLength(0);
      } finally {
        route.cleanup();
      }
    }
  );

  it('redirects other users to their own planner', async () => {
    const { managed, projections } = setup([], true, false);
    const route = renderRoute({ initialPath: '/projections' });
    try {
      await screen.findByRole('button', { name: 'New plan' });
      expect(route.router.state.location.pathname).toBe('/projections/SELF');
      expect(managed).toHaveBeenCalledOnce();
      expect(projections).toHaveBeenCalledOnce();
      expect(screen.getByRole('link', { name: 'Projections' }))
        .toHaveAttribute('href', '/projections');
    } finally {
      route.cleanup();
    }
  });

  it('recognizes portfolio managers without an application role', async () => {
    const { projections } = setup([]);
    const route = renderRoute({ initialPath: '/projections' });
    try {
      expect(await screen.findByRole('link', { name: 'Example PI' }))
        .toHaveAttribute('href', '/projections/PI-2');
      expect(route.router.state.location.pathname).toBe('/projections');
      expect(screen.queryByRole('link', { name: 'Projections' }))
        .not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'View projections for Example PI' }))
        .toHaveAttribute('href', '/projections/PI-2');
      expect(projections).not.toHaveBeenCalled();
    } finally {
      route.cleanup();
    }
  });

  it('keeps the global chooser link for financial viewers without managed PIs', async () => {
    setup(['FinancialViewer'], true, false);
    const route = renderRoute({ initialPath: '/projections' });
    try {
      await screen.findByText("You don't have any managed principal investigators to view yet.");
      expect(screen.getByRole('link', { name: 'Projections' }))
        .toHaveAttribute('href', '/projections');
      expect(route.router.state.location.pathname).toBe('/projections');
    } finally {
      route.cleanup();
    }
  });

  it.each([{ roles: [] }, { roles: ['FinancialViewer'] }])(
    'blocks entry before portfolio requests when disabled for roles %j',
    async ({ roles }) => {
      const { managed, projections } = setup(roles, false);
      const route = renderRoute({ initialPath: '/projections' });
      try {
        await screen.findByText('Projections are not available.');
        expect(route.router.state.location.pathname).toBe('/projections');
        expect(managed).not.toHaveBeenCalled();
        expect(projections).not.toHaveBeenCalled();
        expect(
          screen.queryByRole('link', { name: 'Projections' })
        ).not.toBeInTheDocument();
      } finally {
        route.cleanup();
      }
    }
  );

  it('removes chooser and global entry when the flag turns off', async () => {
    setup(['FinancialViewer']);
    const route = renderRoute({ initialPath: '/projections' });
    try {
      await screen.findByRole('link', { name: 'Example PI' });
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
        screen.queryByRole('link', { name: 'Example PI' })
      ).not.toBeInTheDocument();
      await waitFor(() =>
        expect(
          screen.queryByRole('link', { name: 'Projections' })
        ).not.toBeInTheDocument()
      );
    } finally {
      route.cleanup();
    }
  });

  it.each([true, false])(
    'gates PI card shortcuts on the shared PI page with flag %s',
    async (enabled) => {
      setup(['FinancialViewer'], enabled);
      const route = renderRoute({ initialPath: '/principalInvestigators' });
      try {
        expect(
          await screen.findByRole('link', { name: 'Example PI' })
        ).toHaveAttribute('href', '/projects/PI-2');
        const shortcut = screen.queryByRole('link', {
          name: 'View projections for Example PI',
        });
        if (enabled)
          {expect(shortcut).toHaveAttribute('href', '/projections/PI-2');}
        else {expect(shortcut).not.toBeInTheDocument();}
      } finally {
        route.cleanup();
      }
    }
  );
});
