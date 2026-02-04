import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useHasRole, UserProvider } from '@/shared/auth/UserContext.tsx';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mswUtils.ts';

const createUser = (roles: string[]) => ({
  email: 'test@example.com',
  employeeId: '1000',
  id: 'user-1',
  kerberos: 'testuser',
  name: 'Test User',
  roles,
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <UserProvider>{children}</UserProvider>
      </QueryClientProvider>
    );
  };
}

describe('useHasRole', () => {
  describe('Admin bypass', () => {
    it('returns true for any role check when user has Admin role', async () => {
      server.use(
        http.get('/api/user/me', () => HttpResponse.json(createUser(['Admin'])))
      );

      const { result } = renderHook(() => useHasRole('AccrualViewer'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current).toBe(true);
      });
    });
  });

  describe('specific role checks', () => {
    it('returns true when user has the requested role', async () => {
      server.use(
        http.get('/api/user/me', () =>
          HttpResponse.json(createUser(['AccrualViewer']))
        )
      );

      const { result } = renderHook(() => useHasRole('AccrualViewer'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current).toBe(true);
      });
    });

    it('returns false when user does not have the requested role', async () => {
      server.use(
        http.get('/api/user/me', () =>
          HttpResponse.json(createUser(['Manager']))
        )
      );

      const { result } = renderHook(() => useHasRole('AccrualViewer'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current).toBe(false);
      });
    });
  });

  describe('no roles', () => {
    it('returns false when user has no roles', async () => {
      server.use(
        http.get('/api/user/me', () => HttpResponse.json(createUser([])))
      );

      const { result } = renderHook(() => useHasRole('AccrualViewer'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current).toBe(false);
      });
    });
  });
});