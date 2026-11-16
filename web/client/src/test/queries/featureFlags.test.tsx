import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ReactNode } from 'react';
import { useFeatureFlagsQuery } from '@/queries/featureFlags.ts';

const user = vi.hoisted(() => ({ id: 'first-user' }));
vi.mock('@/shared/auth/UserContext.tsx', () => ({ useUser: () => user }));

const flags = (enabled: boolean) => ({
  burndownEnabled: enabled,
  expenditureProgressEnabled: enabled,
  projectCostsEnabled: enabled,
  projectionsEnabled: enabled,
});

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  user.id = 'first-user';
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  client.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('authenticated feature flags', () => {
  it('uses the existing API and cookie without sending a user identifier', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(flags(true)));
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(() => useFeatureFlagsQuery(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(flags(true)));
    expect(fetch).toHaveBeenCalledWith(
      '/api/system/features',
      expect.objectContaining({ cache: 'no-store', credentials: 'same-origin' })
    );
  });

  it("does not display a previous user's cached enabled flags after identity changes", async () => {
    let completeSecondRequest!: (response: Response) => void;
    const secondResponse = new Promise<Response>((resolve) => {
      completeSecondRequest = resolve;
    });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(flags(true)))
      .mockReturnValueOnce(secondResponse);
    vi.stubGlobal('fetch', fetch);
    const { rerender, result } = renderHook(() => useFeatureFlagsQuery(), {
      wrapper,
    });
    await waitFor(() => expect(result.current.data).toEqual(flags(true)));

    user.id = 'second-user';
    rerender();
    expect(result.current.data).toBeUndefined();
    completeSecondRequest(Response.json(flags(false)));
    await waitFor(() => expect(result.current.data).toEqual(flags(false)));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('refreshes mounted results after two minutes without a navigation', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(flags(true)))
      .mockResolvedValue(Response.json(flags(false)));
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(() => useFeatureFlagsQuery(), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current.data).toEqual(flags(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(119_998);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual(flags(false));
  });
});
