import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
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

const registerHomeApis = () => {
  server.use(
    http.get('/api/project/managed/:employeeId', () => HttpResponse.json([])),
    http.get('/api/project/:employeeId', () => HttpResponse.json([])),
    http.get('/api/project/personnel', () => HttpResponse.json([]))
  );
};

describe('Admin notification page', () => {
  it('shows the Site Notification link on the admin index for Admin users', async () => {
    server.use(
      http.get('/api/user/me', () => HttpResponse.json(createUser(['Admin'])))
    );
    registerHomeApis();

    const { cleanup } = renderRoute({ initialPath: '/admin' });

    try {
      expect(
        await screen.findByRole('link', { name: 'Site Notification' })
      ).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('hides the Site Notification link from Manager users', async () => {
    server.use(
      http.get('/api/user/me', () => HttpResponse.json(createUser(['Manager'])))
    );
    registerHomeApis();

    const { cleanup } = renderRoute({ initialPath: '/admin' });

    try {
      await screen.findByRole('heading', { name: 'Admin Dashboard' });
      expect(
        screen.queryByRole('link', { name: 'Site Notification' })
      ).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('redirects Manager users from /admin/notification to /admin', async () => {
    server.use(
      http.get('/api/user/me', () => HttpResponse.json(createUser(['Manager'])))
    );
    registerHomeApis();

    const { cleanup } = renderRoute({ initialPath: '/admin/notification' });

    try {
      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: 'Admin Dashboard' })
        ).toBeInTheDocument();
      });
      expect(
        screen.queryByRole('heading', { name: 'Site Notification' })
      ).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('prefills the form from the current notification and saves edits', async () => {
    server.use(
      http.get('/api/user/me', () => HttpResponse.json(createUser(['Admin']))),
      http.get('/api/notification', () =>
        HttpResponse.json({
          enabled: true,
          message: 'Existing message',
          updatedOn: '2026-04-01T00:00:00Z',
        })
      )
    );
    registerHomeApis();

    let putBody: { enabled: boolean; message: string } | null = null;
    server.use(
      http.put('/api/notification', async ({ request }) => {
        putBody = (await request.json()) as {
          enabled: boolean;
          message: string;
        };
        return HttpResponse.json({
          enabled: putBody.enabled,
          message: putBody.message,
          updatedOn: '2026-04-27T00:00:00Z',
        });
      })
    );

    const user = userEvent.setup();
    const { cleanup } = renderRoute({ initialPath: '/admin/notification' });

    try {
      const textarea = (await screen.findByLabelText(
        'Message'
      )) as HTMLTextAreaElement;
      expect(textarea.value).toBe('Existing message');

      await user.clear(textarea);
      await user.type(textarea, 'Updated message');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() =>
        expect(screen.getByText('Saved.')).toBeInTheDocument()
      );

      expect(putBody).toEqual({ enabled: true, message: 'Updated message' });
    } finally {
      cleanup();
    }
  });
});
