import { server } from '@/test/mswUtils.ts';
import { renderRoute } from '@/test/routerUtils.tsx';
import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
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

describe('/admin/users', () => {
  it('searches directory users and assigns a role', async () => {
    const entraUserId = '11111111-1111-1111-1111-111111111111';

    server.use(
      http.get('/api/user/me', () =>
        HttpResponse.json(createUser(['Manager']))
      ),
      http.get('/api/admin/users/search', ({ request }) => {
        const url = new URL(request.url);
        const query = url.searchParams.get('query') ?? '';

        if (query.toLowerCase() === 'gra') {
          return HttpResponse.json([
            {
              id: entraUserId,
              displayName: 'Graph User',
              email: 'graph.user@example.com',
            },
          ]);
        }

        return HttpResponse.json([]);
      }),
      http.post('/api/admin/users/:entraUserId/roles', async ({ request }) => {
        const body = (await request.json()) as { roleName?: string };

        return HttpResponse.json({
          added: true,
          user: {
            email: 'graph.user@example.com',
            employeeId: 'E12345',
            iamId: 'IAM-123',
            id: entraUserId,
            kerberos: 'guser',
            name: 'Iam FullName',
            roles: [body.roleName ?? 'AccrualViewer'],
          },
        });
      })
    );
    registerHomeApis();

    const ue = userEvent.setup();
    const { cleanup } = renderRoute({ initialPath: '/admin/users' });

    try {
      await screen.findByRole('heading', { name: 'Admin Users' });

      await ue.type(screen.getByLabelText(/search by name or email/i), 'gra');

      const result = await screen.findByRole('button', {
        name: /Graph User/i,
      });
      await ue.click(result);

      await ue.click(screen.getByRole('button', { name: 'Add Role' }));

      expect(await screen.findByText('Role added.')).toBeInTheDocument();
      expect(
        await screen.findByText('AccrualViewer', { selector: '.badge' })
      ).toBeInTheDocument();
      expect(await screen.findByText('Iam FullName')).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });
});
