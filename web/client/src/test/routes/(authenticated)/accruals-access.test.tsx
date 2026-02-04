import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mswUtils.ts';
import { renderRoute } from '@/test/routerUtils.tsx';

const createUser = (roles: string[]) => ({
  email: 'test@example.com',
  employeeId: '1000',
  id: 'user-1',
  kerberos: 'testuser',
  name: 'Test User',
  roles,
});

describe('Accruals access control', () => {
  describe('header navigation', () => {
    it('shows Accruals link when user has AccrualViewer role', async () => {
      server.use(
        http.get('/api/user/me', () =>
          HttpResponse.json(createUser(['AccrualViewer']))
        ),
        http.get('/api/project/managed/:employeeId', () =>
          HttpResponse.json([])
        ),
        http.get('/api/project/:employeeId', () => HttpResponse.json([])),
        http.get('/api/project/personnel', () => HttpResponse.json([]))
      );

      const { cleanup } = renderRoute({ initialPath: '/' });

      try {
        await waitFor(() => {
          expect(screen.getByRole('link', { name: 'Accruals' })).toBeInTheDocument();
        });
      } finally {
        cleanup();
      }
    });

    it('hides Accruals link when user has no roles', async () => {
      server.use(
        http.get('/api/user/me', () => HttpResponse.json(createUser([]))),
        http.get('/api/project/managed/:employeeId', () =>
          HttpResponse.json([])
        ),
        http.get('/api/project/:employeeId', () => HttpResponse.json([])),
        http.get('/api/project/personnel', () => HttpResponse.json([]))
      );

      const { cleanup } = renderRoute({ initialPath: '/' });

      try {
        await screen.findByRole('heading', { name: 'W.A.L.T.E.R.' });
        expect(screen.queryByRole('link', { name: 'Accruals' })).not.toBeInTheDocument();
      } finally {
        cleanup();
      }
    });
  });
});