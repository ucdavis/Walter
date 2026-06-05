import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mswUtils.ts';
import { renderRoute } from '@/test/routerUtils.tsx';

const createUser = (roles: string[]) => ({
  email: 'test@example.com',
  employeeId: '1000',
  iamId: 'IAM-1000',
  id: 'user-1',
  kerberos: 'testuser',
  name: 'Test User',
  roles,
});

const emptyManagedResponse = {
  pis: [],
  projectManager: null,
};

const managedResponse = (name: string | null = 'Test User') => ({
  pis: [
    { employeeId: '2001', iamId: 'IAM-2001', name: 'PI One', projectCount: 2 },
    { employeeId: '2002', iamId: 'IAM-2002', name: 'PI Two', projectCount: 1 },
  ],
  projectManager: { employeeId: '1000', iamId: 'IAM-1000', name },
});

describe('principal investigators route', () => {
  it('renders the principal investigators table for authorized users', async () => {
    server.use(
      http.get('/api/user/me', () =>
        HttpResponse.json(createUser(['FinancialViewer']))
      ),
      http.get('/api/project/managed/by-iam/:iamId', () =>
        HttpResponse.json(managedResponse())
      )
    );

    const { cleanup } = renderRoute({
      initialPath: '/principalInvestigators',
    });

    try {
      await screen.findByRole('heading', {
        name: 'Principal Investigators managed by Test User',
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

  it('falls back to the generic heading when project manager name is missing', async () => {
    server.use(
      http.get('/api/user/me', () =>
        HttpResponse.json(createUser(['FinancialViewer']))
      ),
      http.get('/api/project/managed/by-iam/:iamId', () =>
        HttpResponse.json(managedResponse(null))
      )
    );

    const { cleanup } = renderRoute({
      initialPath: '/principalInvestigators',
    });

    try {
      await screen.findByRole('heading', {
        name: 'Managed Principal Investigators',
      });
    } finally {
      cleanup();
    }
  });

  it('shows the empty state when no managed investigators are returned', async () => {
    server.use(
      http.get('/api/user/me', () =>
        HttpResponse.json(createUser(['ProjectManager']))
      ),
      http.get('/api/project/managed/by-iam/:iamId', () =>
        HttpResponse.json(emptyManagedResponse)
      )
    );

    const { cleanup } = renderRoute({
      initialPath: '/principalInvestigators',
    });

    try {
      await screen.findByText(
        "Looks like there aren't any principal investigators for Walter to fetch..."
      );
    } finally {
      cleanup();
    }
  });

  it('links managed investigators only when an IAM ID is present', async () => {
    server.use(
      http.get('/api/user/me', () =>
        HttpResponse.json(createUser(['FinancialViewer']))
      ),
      http.get('/api/project/managed/by-iam/:iamId', () =>
        HttpResponse.json({
          pis: [
            {
              employeeId: '2001',
              iamId: 'IAM-PI-ONE',
              name: 'PI One',
              projectCount: 2,
            },
            {
              employeeId: '2002',
              iamId: null,
              name: 'PI Two',
              projectCount: 1,
            },
          ],
          projectManager: { employeeId: '1000', iamId: 'IAM-1000', name: 'Test User' },
        })
      )
    );

    const { cleanup } = renderRoute({
      initialPath: '/principalInvestigators',
    });

    try {
      const linkedPi = await screen.findByRole('link', { name: 'PI One' });
      expect(linkedPi).toHaveAttribute('href', '/projects/IAM-PI-ONE');
      expect(screen.getByText('PI Two').closest('a')).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('redirects unauthorized users back to home', async () => {
    server.use(
      http.get('/api/user/me', () => HttpResponse.json(createUser([]))),
      http.get('/api/project/managed/by-iam/:iamId', () =>
        HttpResponse.json(emptyManagedResponse)
      ),
      http.get('/api/project/by-iam/:iamId', () => HttpResponse.json([])),
      http.get('/api/project/personnel', () => HttpResponse.json([]))
    );

    const { cleanup } = renderRoute({
      initialPath: '/principalInvestigators',
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

describe('principal investigators $iamId route', () => {
  it('allows a FinancialViewer to view another PM', async () => {
    server.use(
      http.get('/api/user/me', () =>
        HttpResponse.json(createUser(['FinancialViewer']))
      ),
      http.get('/api/project/managed/by-iam/:iamId', () =>
        HttpResponse.json({
          pis: [{ employeeId: '2001', iamId: 'IAM-2001', name: 'PI One', projectCount: 2 }],
          projectManager: { employeeId: '9999', iamId: 'IAM-9999', name: 'Other PM' },
        })
      )
    );

    const { cleanup } = renderRoute({
      initialPath: '/principalInvestigators/IAM-9999',
    });

    try {
      await screen.findByRole('heading', {
        name: 'Principal Investigators managed by Other PM',
      });
      expect(screen.getByText('PI One')).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('allows a user to view their own managed PIs via $iamId', async () => {
    server.use(
      http.get('/api/user/me', () =>
        HttpResponse.json(createUser(['ProjectManager']))
      ),
      http.get('/api/project/managed/by-iam/:iamId', () =>
        HttpResponse.json(managedResponse())
      )
    );

    const { cleanup } = renderRoute({
      initialPath: '/principalInvestigators/IAM-1000',
    });

    try {
      await screen.findByRole('heading', {
        name: 'Principal Investigators managed by Test User',
      });
    } finally {
      cleanup();
    }
  });

  it('redirects a non-FinancialViewer viewing another PM back to home', async () => {
    server.use(
      http.get('/api/user/me', () =>
        HttpResponse.json(createUser(['ProjectManager']))
      ),
      http.get('/api/project/managed/by-iam/:iamId', () =>
        HttpResponse.json(emptyManagedResponse)
      ),
      http.get('/api/project/by-iam/:iamId', () => HttpResponse.json([])),
      http.get('/api/project/personnel', () => HttpResponse.json([]))
    );

    const { cleanup } = renderRoute({
      initialPath: '/principalInvestigators/IAM-9999',
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
