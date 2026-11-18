import { server } from '@/test/mswUtils.ts';
import { renderRoute } from '@/test/routerUtils.tsx';
import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

const iamId = '1000000123';
const entraId = '11111111-1111-1111-1111-111111111111';
const person = {
  email: 'person@ucdavis.edu',
  employeeId: '12345678',
  iamId,
  name: 'Campus Person',
};

const registerApis = () => {
  server.use(
    http.get('/api/user/me', () =>
      HttpResponse.json({
        email: 'manager@example.com',
        employeeId: '1000',
        iamId: 'IAM-1000',
        id: 'user-1',
        kerberos: 'manager',
        name: 'Manager',
        roles: ['Manager'],
      })
    ),
    http.get('/api/project/managed/by-iam/:iamId', () =>
      HttpResponse.json({ pis: [], projectManager: null })
    ),
    http.get('/api/project/by-iam/:iamId', () => HttpResponse.json([])),
    http.get('/api/project/personnel', () => HttpResponse.json([])),
    http.get('/api/admin/users/search', ({ request }) => {
      expect(new URL(request.url).searchParams.get('query')).toBe('person');
      return HttpResponse.json([person]);
    }),
    http.get(`/api/admin/users/by-iam/${iamId}/roles`, () =>
      HttpResponse.json({ ...person, roles: [] })
    )
  );
};

const selectPerson = async (ue: ReturnType<typeof userEvent.setup>) => {
  await screen.findByRole('heading', { name: 'User Management' });
  await ue.type(
    screen.getByLabelText(/search by name, email, or username/i),
    'person'
  );
  await ue.click(await screen.findByRole('button', { name: /campus person/i }));
  await screen.findByText('No roles assigned.');
};

describe('/admin/users', () => {
  it('selects a People result without an Entra ID, then grants and removes roles by IAM ID', async () => {
    registerApis();
    let assignedRole = '';
    server.use(
      http.post(
        `/api/admin/users/by-iam/${iamId}/roles`,
        async ({ request }) => {
          const body = (await request.json()) as { roleName: string };
          assignedRole = body.roleName;
          return HttpResponse.json({
            added: true,
            user: {
              ...person,
              id: entraId,
              kerberos: 'pusername',
              roles: [body.roleName],
            },
          });
        }
      ),
      http.delete(
        `/api/admin/users/by-iam/${iamId}/roles`,
        async ({ request }) => {
          expect(await request.json()).toEqual({ roleName: 'AccrualViewer' });
          return HttpResponse.json({ removed: true, roles: [] });
        }
      )
    );
    const ue = userEvent.setup();
    const { cleanup } = renderRoute({ initialPath: '/admin/users' });
    try {
      await selectPerson(ue);
      await ue.click(screen.getByRole('button', { name: 'Add Role' }));
      expect(await screen.findByText('Role added.')).toBeInTheDocument();
      expect(assignedRole).toBe('AccrualViewer');
      expect(
        await screen.findByText('AccrualViewer', { selector: '.badge' })
      ).toBeInTheDocument();
      await ue.click(
        screen.getByRole('button', { name: 'Remove role AccrualViewer' })
      );
      expect(await screen.findByText('No roles assigned.')).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('shows an actionable ambiguous-account error and does not show a successful grant', async () => {
    registerApis();
    const message =
      'Multiple enabled Entra member accounts match this person’s IAM ID.';
    server.use(
      http.post(`/api/admin/users/by-iam/${iamId}/roles`, () =>
        HttpResponse.text(message, { status: 409 })
      )
    );
    const ue = userEvent.setup();
    const { cleanup } = renderRoute({ initialPath: '/admin/users' });
    try {
      await selectPerson(ue);
      await ue.click(screen.getByRole('button', { name: 'Add Role' }));
      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.queryByText('Role added.')).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });
});
