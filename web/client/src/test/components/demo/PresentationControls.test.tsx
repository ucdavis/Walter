import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '@/test/mswUtils.ts';
import type { User } from '@/queries/user.ts';

// Keep the telemetry SDK from patching fetch while isolated API modules reload.
vi.mock('@/lib/rum.ts', () => ({ applyRumUserIdentity: vi.fn() }));

const fictionalUser: User = {
  canPresent: true,
  email: 'ada@example.invalid',
  employeeId: 'DEMO000001',
  iamId: 'DEMO000001',
  id: 'demo-pi',
  isEmulating: false,
  isPresentation: true,
  kerberos: 'demo-pi',
  name: 'Professor Ada Example',
  presentationProfile: 'pi',
  roles: [],
};

const clients: QueryClient[] = [];

beforeEach(() => {
  vi.resetModules();
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.restoreAllMocks();
});

async function renderControls(user = fictionalUser) {
  const { UserProvider } = await import('@/shared/auth/UserContext.tsx');
  const { PresentationControls } = await import(
    '@/components/demo/PresentationControls.tsx'
  );
  const { UserAvatar } = await import('@/components/project/UserAvatar.tsx');
  const { ChartStringCopyButton, FinjectorLink } = await import(
    '@/components/project/FinjectorLink.tsx'
  );
  const { meQueryOptions } = await import('@/queries/user.ts');
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(queryClient);
  queryClient.setQueryData(meQueryOptions().queryKey, user);
  server.use(http.get('/api/user/me', () => HttpResponse.json(user)));
  const { unmount } = render(
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        <PresentationControls />
        <UserAvatar />
        <FinjectorLink org="DEMO" project="DEMO001" task="01">
          Example project
        </FinjectorLink>
        <ChartStringCopyButton org="DEMO" project="DEMO001" task="01" />
        <p>Portfolio contents</p>
      </UserProvider>
    </QueryClientProvider>
  );
  return { queryClient, unmount };
}

describe('Presentation controls', () => {
  it('labels fictional data and suppresses real photos and external project actions', async () => {
    await renderControls();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Presentation — fictional data'
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Professor Ada Example'
    );
    expect(screen.getByRole('combobox', { name: 'Profile' })).toHaveValue('pi');
    expect(
      screen.queryByRole('img', { name: 'User avatar' })
    ).not.toBeInTheDocument();
    expect(document.querySelector('img[src="/api/user/me/photo"]')).toBeNull();
    expect(
      screen.queryByRole('link', { name: /Example project/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Copy chartstring' })
    ).not.toBeInTheDocument();
  });

  it('does not offer presentation access to an ordinary user', async () => {
    await renderControls({
      ...fictionalUser,
      canPresent: false,
      isPresentation: false,
      presentationProfile: null,
    });
    expect(
      screen.queryByRole('region', { name: 'Presentation controls' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Start presentation' })
    ).not.toBeInTheDocument();
  });

  it('uses a fresh CSRF token and keeps data hidden after a failed switch', async () => {
    const requests: Array<{ profile: string; token: string | null }> = [];
    server.use(
      http.get('/api/demo', () =>
        HttpResponse.json({ requestToken: 'request-token' })
      ),
      http.post('/api/demo/start/:profile', ({ params, request }) => {
        requests.push({
          profile: String(params.profile),
          token: request.headers.get('X-CSRF-TOKEN'),
        });
        return new HttpResponse(null, { status: 503 });
      })
    );
    await renderControls();
    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Profile' }),
      'pm'
    );
    await user.click(screen.getByRole('button', { name: 'Switch profile' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your data remains hidden'
    );
    expect(requests).toEqual([{ profile: 'pm', token: 'request-token' }]);
    expect(screen.queryByText('Portfolio contents')).not.toBeInTheDocument();
  });

  it('clears cached data when another tab starts a presentation transition', async () => {
    const { queryClient } = await renderControls();
    queryClient.setQueryData(['private-report'], {
      name: 'Previously loaded data',
    });
    const { PRESENTATION_STORAGE_KEY } = await import('@/lib/api.ts');
    act(() =>
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: PRESENTATION_STORAGE_KEY,
          newValue: 'changed',
        })
      )
    );
    expect(
      await screen.findByRole('heading', {
        name: 'Presentation session paused',
      })
    ).toBeInTheDocument();
    expect(screen.queryByText('Portfolio contents')).not.toBeInTheDocument();
    expect(queryClient.getQueryData(['private-report'])).toBeUndefined();
  });

  it('keeps cached normal data hidden when a transition occurs on a public page', async () => {
    const { queryClient, unmount } = await renderControls({
      ...fictionalUser,
      isPresentation: false,
      presentationProfile: null,
    });
    queryClient.setQueryData(['private-report'], {
      name: 'Real cached report',
    });
    unmount();
    const { isPresentationBlocked, PRESENTATION_STORAGE_KEY } = await import(
      '@/lib/api.ts'
    );
    act(() =>
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: PRESENTATION_STORAGE_KEY,
          newValue: 'other-tab-transition',
        })
      )
    );
    expect(isPresentationBlocked()).toBe(true);
    expect(queryClient.getQueryData(['private-report'])).toBeDefined();
    const { UserProvider } = await import('@/shared/auth/UserContext.tsx');
    render(
      <QueryClientProvider client={queryClient}>
        <UserProvider>
          <p>Real cached report</p>
        </UserProvider>
      </QueryClientProvider>
    );
    expect(
      screen.getByRole('heading', { name: 'Presentation session paused' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Real cached report')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(queryClient.getQueryData(['private-report'])).toBeUndefined()
    );
  });

  it('hides a restored browser-history snapshot before showing recovery', async () => {
    await renderControls();
    act(() =>
      window.dispatchEvent(
        new PageTransitionEvent('pagehide', { persisted: true })
      )
    );
    expect(document.body.style.visibility).toBe('hidden');
    act(() =>
      window.dispatchEvent(
        new PageTransitionEvent('pageshow', { persisted: true })
      )
    );
    expect(
      screen.getByRole('heading', { name: 'Presentation session paused' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Portfolio contents')).not.toBeInTheDocument();
    expect(document.body.style.visibility).not.toBe('hidden');
  });

  it('offers an explicit stop when the user bootstrap fails for an invalid session', async () => {
    const { UserProvider } = await import('@/shared/auth/UserContext.tsx');
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    clients.push(queryClient);
    let stopToken: string | null = null;
    server.use(
      http.get('/api/user/me', () =>
        HttpResponse.json(
          { code: 'presentation_session_invalid' },
          { status: 409 }
        )
      ),
      http.get('/api/demo', () =>
        HttpResponse.json({ requestToken: 'recovery-token' })
      ),
      http.post('/api/demo/stop', ({ request }) => {
        stopToken = request.headers.get('X-CSRF-TOKEN');
        return new HttpResponse(null, { status: 503 });
      })
    );
    render(
      <QueryClientProvider client={queryClient}>
        <UserProvider>
          <p>Private data</p>
        </UserProvider>
      </QueryClientProvider>
    );
    const stop = await screen.findByRole('button', {
      name: 'End presentation and return to Walter',
    });
    await userEvent.setup().click(stop);
    await screen.findByRole('alert');
    expect(stopToken).toBe('recovery-token');
    expect(screen.queryByText('Private data')).not.toBeInTheDocument();
  });
});

describe('Presentation request isolation', () => {
  it('detects a transition epoch even when its storage event was missed', async () => {
    const api = await import('@/lib/api.ts');
    localStorage.setItem(api.PRESENTATION_STORAGE_KEY, 'missed-transition');
    expect(api.checkPresentationContext()).toBe(true);
  });

  it('blocks a resumed tab when a transition event was missed while it was suspended', async () => {
    const api = await import('@/lib/api.ts');
    localStorage.setItem(api.PRESENTATION_STORAGE_KEY, 'suspended-transition');
    window.dispatchEvent(new Event('focus'));
    expect(api.isPresentationBlocked()).toBe(true);
  });

  it('does not start a presentation when other tabs cannot be invalidated', async () => {
    const api = await import('@/lib/api.ts');
    const navigate = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    await expect(
      api.changePresentationProfile('pi', navigate)
    ).rejects.toMatchObject({ status: 409 });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(api.isPresentationBlocked()).toBe(true);
  });

  it('carries the bootstrap context and rejects a response from a different session', async () => {
    const api = await import('@/lib/api.ts');
    let expectedContext: string | null = null;
    server.use(
      http.get('/api/user/me', () =>
        HttpResponse.json(fictionalUser, {
          headers: { 'X-Walter-Presentation': 'demo:pi' },
        })
      ),
      http.get('/api/example', ({ request }) => {
        expectedContext = request.headers.get('X-Walter-Presentation');
        return HttpResponse.json(
          { private: true },
          { headers: { 'X-Walter-Presentation': 'normal' } }
        );
      })
    );
    await api.fetchJson('/api/user/me');
    await expect(api.fetchJson('/api/example')).rejects.toMatchObject({
      status: 409,
    });
    expect(expectedContext).toBe('demo:pi');
    expect(api.isPresentationBlocked()).toBe(true);
  });

  it('rejects a response that was in flight when a transition began', async () => {
    const api = await import('@/lib/api.ts');
    let release: (() => void) | undefined;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requested = false;
    server.use(
      http.get('/api/example', async () => {
        requested = true;
        await waiting;
        return HttpResponse.json({ private: true });
      })
    );
    const outcome = api.fetchJson('/api/example').then(
      () => ({ error: null }),
      (error: unknown) => ({ error })
    );
    try {
      await waitFor(() => expect(requested).toBe(true));
      api.blockPresentationContext();
    } finally {
      release?.();
    }
    expect(await outcome).toMatchObject({ error: { status: 409 } });
  });

  it('preserves presentation intent across a reload when the cookie is gone', async () => {
    sessionStorage.setItem('walter:presentation-context', 'demo:pi');
    const api = await import('@/lib/api.ts');
    server.use(
      http.get('/api/user/me', () =>
        HttpResponse.json(
          { name: 'Real identity' },
          { headers: { 'X-Walter-Presentation': 'normal' } }
        )
      )
    );
    await expect(api.fetchJson('/api/user/me')).rejects.toMatchObject({
      status: 409,
    });
    expect(api.isPresentationBlocked()).toBe(true);
  });

  it('records the selected mode before a successful full navigation', async () => {
    const api = await import('@/lib/api.ts');
    const navigate = vi.fn();
    server.use(
      http.get('/api/demo', () => HttpResponse.json({ requestToken: 'token' })),
      http.post(
        '/api/demo/start/pm',
        () => new HttpResponse(null, { status: 204 })
      )
    );
    await api.changePresentationProfile('pm', navigate);
    expect(sessionStorage.getItem('walter:presentation-context')).toBe(
      'demo:pm'
    );
    expect(navigate).toHaveBeenCalledWith('/');
  });
});
