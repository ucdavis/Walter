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

describe('principal investigators route', () => {
  it('renders the principal investigators table for authorized users', async () => {
    server.use(
      http.get('/api/user/me', () =>
        HttpResponse.json(createUser(['FinancialViewer']))
      ),
      http.get('/api/project/managed/:employeeId', () =>
        HttpResponse.json([
          { employeeId: '2001', name: 'PI One', projectCount: 2 },
          { employeeId: '2002', name: 'PI Two', projectCount: 1 },
        ])
      )
    );

    const { cleanup } = renderRoute({
      initialPath: '/principalinvestigators',
    });

    try {
      await screen.findByRole('heading', {
        name: "Test User's Principal Investigators",
      });
      expect(screen.getByText('PI One')).toBeInTheDocument();
      expect(screen.getByText('PI Two')).toBeInTheDocument();
      expect(
        screen.getByText('2 investigators across 3 projects')
      ).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('shows the empty state when no managed investigators are returned', async () => {
    server.use(
      http.get('/api/user/me', () =>
        HttpResponse.json(createUser(['ProjectManager']))
      ),
      http.get('/api/project/managed/:employeeId', () => HttpResponse.json([]))
    );

    const { cleanup } = renderRoute({
      initialPath: '/principalinvestigators',
    });

    try {
      await screen.findByText(
        "Looks like you don't have any principal investigators for Walter to fetch..."
      );
    } finally {
      cleanup();
    }
  });

  it('redirects unauthorized users back to home', async () => {
    server.use(
      http.get('/api/user/me', () => HttpResponse.json(createUser([]))),
      http.get('/api/project/managed/:employeeId', () => HttpResponse.json([])),
      http.get('/api/project/:employeeId', () => HttpResponse.json([])),
      http.get('/api/project/personnel', () => HttpResponse.json([]))
    );

    const { cleanup } = renderRoute({
      initialPath: '/principalinvestigators',
    });

    try {
      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: 'W.A.L.T.E.R.' })
        ).toBeInTheDocument();
      });
    } finally {
      cleanup();
    }
  });
});
