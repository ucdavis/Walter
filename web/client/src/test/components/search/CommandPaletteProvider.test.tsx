import { server } from '@/test/mswUtils.ts';
import { renderRoute } from '@/test/routerUtils.tsx';
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

const defaultUser = {
  email: 'alpha@example.com',
  employeeId: '1000',
  id: 'user-1',
  kerberos: 'alpha',
  name: 'Alpha User',
  roles: [],
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
        'Search projects, people, reports...'
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
              projectPiEmployeeId: '2001',
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
        'Search projects, people, reports...'
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

  it('resets query on close', async () => {
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

      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /search…/i }));

      const input = await screen.findByPlaceholderText(
        'Search projects, people, reports...'
      );
      await user.type(input, 'alpha');

      await user.keyboard('{Escape}');
      await waitFor(() => expect(dialog).not.toHaveAttribute('open'));

      await user.click(screen.getByRole('button', { name: /search…/i }));
      const inputReopen = await screen.findByPlaceholderText(
        'Search projects, people, reports...'
      );
      expect(inputReopen).toHaveValue('');
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

  it('uses financial search endpoints for PM users and does not preload team projects', async () => {
    let teamProjectsRequests = 0;
    let financialProjectRequests = 0;
    let peopleRequests = 0;

    server.use(
      http.get('/api/user/me', () =>
        HttpResponse.json({ ...defaultUser, roles: ['ProjectManager'] })
      ),
      http.get('/api/search/catalog', () =>
        HttpResponse.json({ projects: [], reports: [] })
      ),
      http.get('/api/search/projects/team', () => {
        teamProjectsRequests += 1;
        return HttpResponse.json({ projects: [], principalInvestigators: [] });
      }),
      http.get('/api/search/projects', ({ request }) => {
        financialProjectRequests += 1;
        const url = new URL(request.url);
        const query = url.searchParams.get('query') ?? '';
        if (query.toLowerCase().includes('fpaf')) {
          return HttpResponse.json([
            {
              keywords: ['FPAFST5328', 'Forest Ecology'],
              projectName: 'FPAFST5328: Forest Ecology',
              projectNumber: 'FPAFST5328',
            },
          ]);
        }
        return HttpResponse.json([]);
      }),
      http.get('/api/search/people', ({ request }) => {
        peopleRequests += 1;
        const url = new URL(request.url);
        const query = (url.searchParams.get('query') ?? '').toLowerCase();
        if (query.includes('esspang')) {
          return HttpResponse.json([
            {
              email: 'esspang@ucdavis.edu',
              id: 'entra-esspang',
              keywords: ['Edward Spang', 'esspang@ucdavis.edu'],
              name: 'Edward Spang',
            },
          ]);
        }
        return HttpResponse.json([]);
      })
    );

    const { cleanup } = renderRoute({ initialPath: '/styles' });

    try {
      await screen.findByText('Heading 1');

      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /search…/i }));

      const input = await screen.findByPlaceholderText(
        'Search projects, people, reports...'
      );
      await user.type(input, 'fpaf');

      expect(await screen.findByText('FPAFST5328: Forest Ecology')).toBeInTheDocument();
      expect(financialProjectRequests).toBeGreaterThan(0);
      expect(teamProjectsRequests).toBe(0);

      await user.clear(input);
      await user.type(input, 'esspang');

      expect(await screen.findByText('People')).toBeInTheDocument();
      expect(await screen.findByText('Edward Spang')).toBeInTheDocument();
      expect(peopleRequests).toBeGreaterThan(0);
      expect(teamProjectsRequests).toBe(0);
    } finally {
      cleanup();
    }
  });

  it('shows start-typing helper text for financial users and limits project/people results to five', async () => {
    server.use(
      http.get('/api/user/me', () =>
        HttpResponse.json({ ...defaultUser, roles: ['ProjectManager'] })
      ),
      http.get('/api/search/catalog', () =>
        HttpResponse.json({
          projects: [],
          reports: [
            {
              id: 'reports',
              keywords: ['reports'],
              label: 'All Reports',
              to: '/reports',
            },
          ],
        })
      ),
      http.get('/api/search/projects/team', () =>
        HttpResponse.json({ projects: [], principalInvestigators: [] })
      ),
      http.get('/api/search/projects', ({ request }) => {
        const url = new URL(request.url);
        const query = (url.searchParams.get('query') ?? '').toLowerCase();
        if (!query.includes('fpaf')) {
          return HttpResponse.json([]);
        }

        return HttpResponse.json(
          Array.from({ length: 6 }, (_, i) => ({
            keywords: [`FPAF${i + 1}`],
            projectName: `FPAF Project ${i + 1}`,
            projectNumber: `FPAF${i + 1}`,
          }))
        );
      }),
      http.get('/api/search/people', ({ request }) => {
        const url = new URL(request.url);
        const query = (url.searchParams.get('query') ?? '').toLowerCase();
        if (!query.includes('spang')) {
          return HttpResponse.json([]);
        }

        return HttpResponse.json(
          Array.from({ length: 6 }, (_, i) => ({
            email: `spang${i + 1}@ucdavis.edu`,
            id: `entra-spang-${i + 1}`,
            keywords: [`Spang ${i + 1}`],
            name: `Spang Person ${i + 1}`,
          }))
        );
      })
    );

    const { cleanup } = renderRoute({ initialPath: '/styles' });

    try {
      await screen.findByText('Heading 1');
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: /search…/i }));

      expect(
        await screen.findByText('Start typing to search projects and people.')
      ).toBeInTheDocument();
      expect(await screen.findByText('All Reports')).toBeInTheDocument();

      const input = await screen.findByPlaceholderText(
        'Search projects, people, reports...'
      );
      await user.type(input, 'fpaf');

      expect(await screen.findByText('FPAF Project 1')).toBeInTheDocument();
      expect(await screen.findByText('FPAF Project 5')).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.queryByText('FPAF Project 6')).not.toBeInTheDocument()
      );

      await user.clear(input);
      await user.type(input, 'spang');

      expect(await screen.findByText('Spang Person 1')).toBeInTheDocument();
      expect(await screen.findByText('Spang Person 5')).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.queryByText('Spang Person 6')).not.toBeInTheDocument()
      );
    } finally {
      cleanup();
    }
  });
});
