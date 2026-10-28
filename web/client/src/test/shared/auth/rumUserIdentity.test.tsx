import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootstrapRum, resetRumForTests } from '@/lib/rum.ts';
import { meQueryOptions, type User } from '@/queries/user.ts';
import { UserProvider } from '@/shared/auth/UserContext.tsx';

const user: User = {
  email: 'test@example.com',
  employeeId: '1000',
  iamId: '001234567',
  id: '11111111-2222-3333-4444-555555555555',
  isEmulating: false,
  kerberos: 'testuser',
  name: 'Test User',
  roles: [],
};

describe('UserProvider RUM identity', () => {
  beforeEach(() => resetRumForTests());
  afterEach(() => resetRumForTests());

  it('uses the cached user query, follows changes, and clears on unmount', async () => {
    const setUserContext = vi.fn();
    await bootstrapRum({
      fetchConfig: async () => ({
        enabled: true,
        environment: 'test',
        serverUrl: 'https://elastic.example',
        serviceName: 'walter-web',
        serviceVersion: 'test',
        transactionSampleRate: 1,
      }),
      init: () => ({ addFilter: vi.fn(), setUserContext }),
    });
    const queryClient = new QueryClient();
    const { queryKey } = meQueryOptions();
    queryClient.setQueryData(queryKey, user);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <UserProvider>
          <div>Authenticated page</div>
        </UserProvider>
      </QueryClientProvider>
    );
    await waitFor(() =>
      expect(setUserContext).toHaveBeenLastCalledWith({ id: user.iamId })
    );
    await act(async () => {
      queryClient.setQueryData(queryKey, { ...user, iamId: '009876543' });
    });
    await waitFor(() =>
      expect(setUserContext).toHaveBeenLastCalledWith({ id: '009876543' })
    );
    await act(async () => {
      queryClient.setQueryData(queryKey, { ...user, iamId: '' });
    });
    await waitFor(() =>
      expect(setUserContext).toHaveBeenLastCalledWith({ id: '' })
    );
    await act(async () => {
      queryClient.setQueryData(queryKey, user);
    });
    await waitFor(() =>
      expect(setUserContext).toHaveBeenLastCalledWith({ id: user.iamId })
    );
    unmount();
    expect(setUserContext).toHaveBeenLastCalledWith({ id: '' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    queryClient.clear();
  });
});
