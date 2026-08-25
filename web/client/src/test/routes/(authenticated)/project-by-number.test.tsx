import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '@/test/mswUtils.ts';
import { renderRoute } from '@/test/routerUtils.tsx';

describe('project by number route', () => {
  it('shows an access-denied message when project resolution is forbidden', async () => {
    server.use(
      http.get('/api/user/me', () =>
        HttpResponse.json({
          email: 'pi@example.com',
          employeeId: '1000',
          iamId: 'IAM-PI',
          id: 'user-1',
          kerberos: 'piuser',
          name: 'PI User',
          roles: [],
        })
      ),
      http.get('/api/project/managed/by-iam/:iamId', () =>
        HttpResponse.json({ pis: [], projectManager: null })
      ),
      http.get('/api/search/projects/resolve-pi', () =>
        HttpResponse.json({}, { status: 403 })
      )
    );

    const { cleanup } = renderRoute({
      initialPath: '/projects/by-number/DEPTNURS02',
    });

    try {
      expect(
        await screen.findByRole('heading', {
          name: 'Project unavailable',
        })
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /could not be found, or you do not have permission to open it\./
        )
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: 'Project not found' })
      ).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });
});
