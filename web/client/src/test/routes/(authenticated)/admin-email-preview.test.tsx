import { server } from '@/test/mswUtils.ts';
import { renderRoute } from '@/test/routerUtils.tsx';
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

const createUser = (roles: string[]) => ({
  email: 'test@example.com',
  employeeId: '1000',
  iamId: 'IAM-1000',
  id: 'user-1',
  kerberos: 'testuser',
  name: 'Test User',
  roles,
});

const registerHomeApis = () => {
  server.use(
    http.get('/api/project/managed/by-iam/:iamId', () =>
      HttpResponse.json({ pis: [], projectManager: null })
    ),
    http.get('/api/project/by-iam/:iamId', () => HttpResponse.json([])),
    http.get('/api/project/personnel', () => HttpResponse.json([]))
  );
};

describe('Admin email preview page', () => {
  it('shows the Email Preview link on the admin index for Admin users', async () => {
    server.use(
      http.get('/api/user/me', () => HttpResponse.json(createUser(['Admin'])))
    );
    registerHomeApis();

    const { cleanup } = renderRoute({ initialPath: '/admin' });

    try {
      expect(
        await screen.findByRole('link', { name: 'Email Preview' })
      ).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('redirects Manager users from /admin/email-preview to /admin', async () => {
    server.use(
      http.get('/api/user/me', () => HttpResponse.json(createUser(['Manager'])))
    );
    registerHomeApis();

    const { cleanup } = renderRoute({ initialPath: '/admin/email-preview' });

    try {
      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: 'Admin Dashboard' })
        ).toBeInTheDocument();
      });
      expect(
        screen.queryByRole('heading', { name: 'Email Preview' })
      ).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('renders the preview with editable envelope fields and payload JSON', async () => {
    server.use(
      http.get('/api/user/me', () => HttpResponse.json(createUser(['Admin'])))
    );
    registerHomeApis();

    let postBody: unknown = null;
    server.use(
      http.post('/api/admin/email-preview/render', async ({ request }) => {
        postBody = await request.json();
        return HttpResponse.json({
          htmlBody: '<html><body><p>Rendered HTML</p></body></html>',
          subject: 'Action Needed: Your Vacation Accrual is at 100% of Maximum',
          textBody: 'Rendered text',
        });
      })
    );

    const user = userEvent.setup();
    const { cleanup } = renderRoute({ initialPath: '/admin/email-preview' });

    try {
      await screen.findByRole('heading', { name: 'Email Preview' });
      await user.click(screen.getByRole('button', { name: 'Preview' }));

      await waitFor(() => {
        expect(
          screen.getByText(
            'Action Needed: Your Vacation Accrual is at 100% of Maximum'
          )
        ).toBeInTheDocument();
      });

      expect(screen.getByText('Rendered text')).toBeInTheDocument();
      expect(postBody).toMatchObject({
        notificationType: 'accrual.employee',
        payloadVersion: 1,
        recipientName: 'Staff Member',
        templateKey: 'accrual.employee.staff.v1',
        templateVersion: 1,
      });
      expect(postBody).toEqual(
        expect.objectContaining({
          payloadJson: expect.stringContaining('"pctOfCap": 100'),
        })
      );
    } finally {
      cleanup();
    }
  });
});
