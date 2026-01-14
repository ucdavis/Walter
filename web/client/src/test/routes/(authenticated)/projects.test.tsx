import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mswUtils.ts';
import { renderRoute } from '@/test/routerUtils.tsx';

describe('projects route', () => {
  it('renders managed investigators dashboard when user manages investigators', async () => {
    const managedPis = [
      { employeeId: '2001', name: 'PI One', projectCount: 2 },
      { employeeId: '2002', name: 'PI Two', projectCount: 1 },
    ];

    const user = {
      email: 'alpha@example.com',
      employeeId: '1000',
      id: 'user-1',
      kerberos: 'alpha',
      name: 'Alpha User',
      roles: ['admin'],
    };

    let managedRequestCount = 0;
    let userRequestCount = 0;

    server.use(
      http.get('/api/project/managed/:employeeId', ({ params }) => {
        managedRequestCount += 1;
        if (params.employeeId !== user.employeeId) {
          return HttpResponse.json([], { status: 400 });
        }
        return HttpResponse.json(managedPis);
      }),
      http.get('/api/user/me', () => {
        userRequestCount += 1;
        return HttpResponse.json(user);
      })
    );

    const { cleanup } = renderRoute({ initialPath: '/projects' });

    try {
      expect(
        await screen.findByRole('heading', { name: 'Managed Investigators' })
      ).toBeInTheDocument();
      expect(await screen.findByText('PI One')).toBeInTheDocument();
      expect(managedRequestCount).toBe(1);
      expect(userRequestCount).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('redirects to my projects when user manages no investigators', async () => {
    const user = {
      email: 'alpha@example.com',
      employeeId: '1000',
      id: 'user-1',
      kerberos: 'alpha',
      name: 'Alpha User',
      roles: ['admin'],
    };

    server.use(
      http.get('/api/user/me', () => HttpResponse.json(user)),
      http.get('/api/project/managed/:employeeId', () => HttpResponse.json([])),
      http.get('/api/project/:employeeId', () => HttpResponse.json([]))
    );

    const { cleanup, router } = renderRoute({ initialPath: '/projects' });

    try {
      expect(
        await screen.findByText("We didn't find any projects for you.")
      ).toBeInTheDocument();
      expect(router.state.location.pathname).toContain(
        `/projects/${user.employeeId}`
      );
    } finally {
      cleanup();
    }
  });
});
