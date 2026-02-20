import { server } from '@/test/mswUtils.ts';
import { renderRoute } from '@/test/routerUtils.tsx';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

const createUser = (roles: string[]) => ({
  email: 'test@example.com',
  employeeId: '1000',
  id: 'user-1',
  kerberos: 'testuser',
  name: 'Test User',
  roles,
});

const registerHomeApis = () => {
  server.use(
    http.get('/api/project/managed/:employeeId', () => HttpResponse.json([])),
    http.get('/api/project/:employeeId', () => HttpResponse.json([])),
    http.get('/api/project/personnel', () => HttpResponse.json([]))
  );
};

describe('Admin dashboard access control', () => {
  it('shows Admin link for Admin users and allows /admin', async () => {
    server.use(
      http.get('/api/user/me', () => HttpResponse.json(createUser(['Admin'])))
    );
    registerHomeApis();

    const { cleanup } = renderRoute({ initialPath: '/admin' });

    try {
      await screen.findByRole('heading', { name: 'Admin Dashboard' });
      expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'Admin Users' })
      ).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('shows Admin link (but not Admin Users link) for Manager users', async () => {
    server.use(
      http.get('/api/user/me', () => HttpResponse.json(createUser(['Manager'])))
    );
    registerHomeApis();

    const { cleanup } = renderRoute({ initialPath: '/admin' });

    try {
      await screen.findByRole('heading', { name: 'Admin Dashboard' });
      expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'Admin Users' })
      ).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('redirects non-admin and non-manager users away from /admin', async () => {
    server.use(http.get('/api/user/me', () => HttpResponse.json(createUser([]))));
    registerHomeApis();

    const { cleanup } = renderRoute({ initialPath: '/admin' });

    try {
      await screen.findByRole('heading', { name: 'W.A.L.T.E.R.' });
      expect(
        screen.queryByRole('heading', { name: 'Admin Dashboard' })
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'Admin Users' })
      ).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('allows Manager users to open /admin/users', async () => {
    server.use(
      http.get('/api/user/me', () => HttpResponse.json(createUser(['Manager'])))
    );
    registerHomeApis();

    const { cleanup } = renderRoute({ initialPath: '/admin/users' });

    try {
      await screen.findByRole('heading', { name: 'User Management' });
    } finally {
      cleanup();
    }
  });

  it('redirects Admin users from /admin/users to /admin', async () => {
    server.use(
      http.get('/api/user/me', () => HttpResponse.json(createUser(['Admin'])))
    );
    registerHomeApis();

    const { cleanup } = renderRoute({ initialPath: '/admin/users' });

    try {
      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: 'Admin Dashboard' })
        ).toBeInTheDocument();
      });
      expect(
        screen.queryByRole('heading', { name: 'User Management' })
      ).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });
});
