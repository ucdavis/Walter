import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
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

async function renderHomeForRoles(roles: string[]) {
  server.use(http.get('/api/user/me', () => HttpResponse.json(createUser(roles))));
  registerHomeApis();

  const rendered = renderRoute({ initialPath: '/' });
  await screen.findByRole('heading', { name: 'W.A.L.T.E.R.' });
  return rendered;
}

describe('header navigation access control', () => {
  it('shows Projects, Personnel, and Reports for default users', async () => {
    const { cleanup } = await renderHomeForRoles([]);

    try {
      expect(screen.getByRole('link', { name: 'Projects' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Personnel' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Reports' })).toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'Principal Investigators' })
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('shows Admin and Reports for Admin users', async () => {
    const { cleanup } = await renderHomeForRoles(['Admin']);

    try {
      expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Reports' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Projects' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Personnel' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'Principal Investigators' })
      ).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('shows Admin and Reports for Manager users', async () => {
    const { cleanup } = await renderHomeForRoles(['Manager']);

    try {
      expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Reports' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Projects' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Personnel' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'Principal Investigators' })
      ).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('shows Reports only for AccrualViewer users', async () => {
    const { cleanup } = await renderHomeForRoles(['AccrualViewer']);

    try {
      expect(screen.getByRole('link', { name: 'Reports' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Projects' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Personnel' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'Principal Investigators' })
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('shows Principal Investigators and Reports for FinancialViewer users', async () => {
    const { cleanup } = await renderHomeForRoles(['FinancialViewer']);

    try {
      expect(screen.getByText('Principal Investigators')).toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'Principal Investigators' })
      ).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Reports' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Projects' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Personnel' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('shows Principal Investigators and Reports for ProjectManager users', async () => {
    const { cleanup } = await renderHomeForRoles(['ProjectManager']);

    try {
      expect(screen.getByText('Principal Investigators')).toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'Principal Investigators' })
      ).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Reports' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Projects' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Personnel' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it('shows no top-level nav items for System users', async () => {
    const { cleanup } = await renderHomeForRoles(['System']);

    try {
      expect(screen.queryByRole('link', { name: 'Projects' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Personnel' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'Principal Investigators' })
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Reports' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });
});
