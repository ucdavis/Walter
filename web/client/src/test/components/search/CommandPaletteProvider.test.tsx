import { server } from '@/test/mswUtils.ts';
import { renderRoute } from '@/test/routerUtils.tsx';
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

const defaultUser = {
  email: 'alpha@example.com',
  employeeId: '1000',
  id: 'user-1',
  kerberos: 'alpha',
  name: 'Alpha User',
  roles: ['admin'],
};

describe('CommandPaletteProvider', () => {
  it('opens via SearchButton click and autofocuses the input', async () => {
    server.use(
      http.get('/api/user/me', () => HttpResponse.json(defaultUser)),
      http.get('/api/search/catalog', () =>
        HttpResponse.json({ projects: [], reports: [] })
      ),
      http.get('/api/search/projects/team', () =>
        HttpResponse.json({ projects: [], principalInvestigators: [] })
      )
    );

    const { cleanup } = renderRoute({ initialPath: '/styles' });

    try {
      await screen.findByText('Heading 1');

      const dialog = document.querySelector(
        'dialog.modal'
      ) as HTMLDialogElement;
      expect(dialog).toBeInTheDocument();
      expect(dialog.hasAttribute('open')).toBe(false);

      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /search…/i }));

      await waitFor(() => expect(dialog).toHaveAttribute('open'));

      const input = await screen.findByPlaceholderText(
        'Search projects, reports, people...'
      );
      await waitFor(() => expect(input).toHaveFocus());
    } finally {
      cleanup();
    }
  });

  it('toggles via Ctrl+K and closes on second press', async () => {
    server.use(
      http.get('/api/user/me', () => HttpResponse.json(defaultUser)),
      http.get('/api/search/catalog', () =>
        HttpResponse.json({ projects: [], reports: [] })
      ),
      http.get('/api/search/projects/team', () =>
        HttpResponse.json({ projects: [], principalInvestigators: [] })
      )
    );

    const { cleanup } = renderRoute({ initialPath: '/styles' });

    try {
      await screen.findByText('Heading 1');
      const dialog = document.querySelector(
        'dialog.modal'
      ) as HTMLDialogElement;

      window.dispatchEvent(
        new KeyboardEvent('keydown', { ctrlKey: true, key: 'k' })
      );

      await waitFor(() => expect(dialog).toHaveAttribute('open'));

      window.dispatchEvent(
        new KeyboardEvent('keydown', { ctrlKey: true, key: 'k' })
      );

      await waitFor(() => expect(dialog).not.toHaveAttribute('open'));
    } finally {
      cleanup();
    }
  });

  it('fetches catalog once and reuses it across opens', async () => {
    let catalogRequests = 0;
    let teamProjectsRequests = 0;
    server.use(
      http.get('/api/user/me', () => HttpResponse.json(defaultUser)),
      http.get('/api/search/catalog', () => {
        catalogRequests += 1;
        return HttpResponse.json({
          projects: [],
          reports: [
            {
              id: 'me',
              keywords: ['me', 'profile'],
              label: 'My Profile',
              to: '/me',
            },
          ],
        });
      }),
      http.get('/api/search/projects/team', () => {
        teamProjectsRequests += 1;
        return HttpResponse.json({
          projects: [
            {
              keywords: ['P-001', 'Alpha'],
              projectName: 'Project Alpha',
              projectNumber: 'P-001',
            },
          ],
          principalInvestigators: [],
        });
      })
    );

    const { cleanup } = renderRoute({ initialPath: '/styles' });

    try {
      await screen.findByText('Heading 1');
      const dialog = document.querySelector(
        'dialog.modal'
      ) as HTMLDialogElement;
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: /search…/i }));
      await screen.findByText('Project Alpha');
      expect(catalogRequests).toBe(1);
      expect(teamProjectsRequests).toBe(1);

      // Ensure focus is inside the dialog so Escape is handled by cmdk.
      const input = screen.getByPlaceholderText(
        'Search projects, reports, people...'
      );
      input.focus();

      await user.keyboard('{Escape}');
      await waitFor(() => expect(dialog).not.toHaveAttribute('open'));

      await user.click(screen.getByRole('button', { name: /search…/i }));
      await screen.findByText('Project Alpha');
      expect(catalogRequests).toBe(1);
      expect(teamProjectsRequests).toBe(1);
      expect(screen.queryByText('Loading projects…')).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('debounces people search and resets query on close', async () => {
    let peopleRequests = 0;
    server.use(
      http.get('/api/user/me', () => HttpResponse.json(defaultUser)),
      http.get('/api/search/catalog', () =>
        HttpResponse.json({ projects: [], reports: [] })
      ),
      http.get('/api/search/projects/team', () =>
        HttpResponse.json({ projects: [], principalInvestigators: [] })
      ),
      http.get('/api/search/people', async ({ request }) => {
        peopleRequests += 1;
        const url = new URL(request.url);
        const q = url.searchParams.get('query') ?? '';

        await delay(400);

        return HttpResponse.json(
          q.toLowerCase().includes('ali')
            ? [
                {
                  employeeId: '2001',
                  keywords: ['Alice', '2001'],
                  name: 'Alice Example',
                },
              ]
            : []
        );
      })
    );

    const { cleanup } = renderRoute({ initialPath: '/styles' });

    try {
      await screen.findByText('Heading 1');
      const dialog = document.querySelector(
        'dialog.modal'
      ) as HTMLDialogElement;

      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /search…/i }));

      const input = await screen.findByPlaceholderText(
        'Search projects, reports, people...'
      );
      await user.type(input, 'ali');

      expect(await screen.findByText('Searching people…')).toBeInTheDocument();
      expect(await screen.findByText('Alice Example')).toBeInTheDocument();
      expect(peopleRequests).toBe(1);

      await user.keyboard('{Escape}');
      await waitFor(() => expect(dialog).not.toHaveAttribute('open'));

      await user.click(screen.getByRole('button', { name: /search…/i }));
      const inputReopen = await screen.findByPlaceholderText(
        'Search projects, reports, people...'
      );
      expect(inputReopen).toHaveValue('');

      await user.type(inputReopen, 'ali');
      expect(await screen.findByText('Searching people…')).toBeInTheDocument();
      expect(await screen.findByText('Alice Example')).toBeInTheDocument();
      expect(peopleRequests).toBe(2);
    } finally {
      cleanup();
    }
  });

  it('shows principal investigators under a PIs group', async () => {
    server.use(
      http.get('/api/user/me', () => HttpResponse.json(defaultUser)),
      http.get('/api/search/catalog', () =>
        HttpResponse.json({ projects: [], reports: [] })
      ),
      http.get('/api/search/projects/team', () =>
        HttpResponse.json({
          projects: [],
          principalInvestigators: [
            {
              employeeId: '2001',
              keywords: ['Alice', '2001'],
              name: 'Alice Example',
            },
          ],
        })
      )
    );

    const { cleanup } = renderRoute({ initialPath: '/styles' });

    try {
      await screen.findByText('Heading 1');
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: /search…/i }));

      expect(await screen.findByText('PIs')).toBeInTheDocument();
      expect(await screen.findByText('Alice Example')).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });
});
