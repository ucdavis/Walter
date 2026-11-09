export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
    public body?: unknown
  ) {
    super(`HTTP ${status} for ${url}`);
  }
}

const toRedirectParam = () =>
  encodeURIComponent(window.location.pathname + window.location.search);

export const PRESENTATION_CONTEXT_EVENT = 'walter:presentation-context-changed';
export const PRESENTATION_STORAGE_KEY = 'walter:presentation-transition';
const PRESENTATION_HEADER = 'X-Walter-Presentation';
const PRESENTATION_SESSION_KEY = 'walter:presentation-context';
const readPresentationEpoch = () => {
  try {
    return localStorage.getItem(PRESENTATION_STORAGE_KEY);
  } catch {
    return null;
  }
};
const presentationEpoch = readPresentationEpoch();
const readPresentationContext = () => {
  try {
    const context = sessionStorage.getItem(PRESENTATION_SESSION_KEY);
    return context === 'normal' ||
      context === 'demo:pi' ||
      context === 'demo:pm'
      ? context
      : null;
  } catch {
    return null;
  }
};
let expectedPresentationContext: string | null = readPresentationContext();
let presentationBlocked = false;

export const isPresentationBlocked = () => presentationBlocked;

/** Hide stale data until the presenter explicitly establishes a new session. */
export function blockPresentationContext() {
  if (!presentationBlocked) {
    presentationBlocked = true;
    window.dispatchEvent(new Event(PRESENTATION_CONTEXT_EVENT));
  }
}

/** Recheck before using cached route data, including after a tab was suspended. */
export function checkPresentationContext() {
  if (readPresentationEpoch() !== presentationEpoch) {
    blockPresentationContext();
  }
  return presentationBlocked;
}

// This listener must outlive authenticated pages: a tab may be on the public About page.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (
      event.key === null ||
      (event.key === PRESENTATION_STORAGE_KEY &&
        event.newValue !== presentationEpoch)
    ) {
      blockPresentationContext();
    }
  });
  window.addEventListener('focus', checkPresentationContext);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkPresentationContext();
    }
  });
}

const rememberPresentationContext = (context: string) => {
  try {
    // Preserve only the expected mode so a reload cannot silently leave a presentation.
    sessionStorage.setItem(PRESENTATION_SESSION_KEY, context);
  } catch {
    if (context.startsWith('demo:')) {
      blockPresentationContext();
      throw new HttpError(409, '/api/user/me', {
        code: 'presentation_session_invalid',
      });
    }
  }
  expectedPresentationContext = context;
};

const notifyPresentationTabs = () => {
  try {
    // This marker contains no identity or session token; it only invalidates other tabs.
    localStorage.setItem(PRESENTATION_STORAGE_KEY, crypto.randomUUID());
    return true;
  } catch {
    return false;
  }
};

export async function changePresentationProfile(
  profile: 'pi' | 'pm' | null,
  navigate: (url: string) => void = (url) => window.location.replace(url)
) {
  blockPresentationContext();
  // Starting requires cross-tab invalidation; explicit stop must remain available for recovery.
  if (!notifyPresentationTabs() && profile) {
    throw new HttpError(409, '/api/demo', {
      code: 'presentation_session_invalid',
    });
  }
  try {
    const session = await fetchJson<{ requestToken: string }>('/api/demo');
    await fetchJson<void>(
      profile ? `/api/demo/start/${profile}` : '/api/demo/stop',
      { headers: { 'X-CSRF-TOKEN': session.requestToken }, method: 'POST' }
    );
    rememberPresentationContext(profile ? `demo:${profile}` : 'normal');
    notifyPresentationTabs();
    navigate('/');
  } catch (error) {
    notifyPresentationTabs();
    throw error;
  }
}

// main fn for fetching json w/ built in error handling, auth redirection and it'll work well w/ react query
export async function fetchJson<T>(
  url: string,
  init: RequestInit & { skipRedirectOn401?: boolean } = {},
  signal?: AbortSignal
): Promise<T> {
  const isUserBootstrap = url === '/api/user/me';
  const isPresentationControl =
    url === '/api/demo' || url.startsWith('/api/demo/');
  if (!isPresentationControl) {
    checkPresentationContext();
  }
  const requestContext = expectedPresentationContext;
  if (presentationBlocked && !isUserBootstrap && !isPresentationControl) {
    throw new HttpError(409, url, { code: 'presentation_context_changed' });
  }

  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (requestContext) {
    headers.set(PRESENTATION_HEADER, requestContext);
  }
  const res = await fetch(url, {
    credentials: 'same-origin', // front/back proxy on same domain and during prod it's same origin too
    signal, // for cancellation/abort
    ...init,
    headers,
  });

  const responseContext = res.headers.get(PRESENTATION_HEADER);
  // A delayed response must not repopulate the cache after another tab changes mode.
  if (
    !isPresentationControl &&
    (responseContext === 'invalid' ||
      (requestContext &&
        responseContext &&
        responseContext !== requestContext) ||
      (requestContext?.startsWith('demo:') && !responseContext) ||
      (presentationBlocked && !isUserBootstrap))
  ) {
    blockPresentationContext();
    throw new HttpError(409, url, { code: 'presentation_context_changed' });
  }

  // 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  // Auto-redirect on 401
  if (res.status === 401 && !init.skipRedirectOn401) {
    if (requestContext?.startsWith('demo:') || presentationBlocked) {
      blockPresentationContext();
      throw new HttpError(409, url, { code: 'presentation_session_invalid' });
    }
    window.location.href = `/login?returnUrl=${toRedirectParam()}`;
    // Halt the current render/update
    return new Promise<T>(() => {});
  }

  const text = await res.text();
  const contentType = res.headers.get('content-type') || '';
  const data =
    contentType.includes('application/json') && text ? JSON.parse(text) : text;

  if (presentationBlocked && !isPresentationControl && !isUserBootstrap) {
    throw new HttpError(409, url, { code: 'presentation_context_changed' });
  }

  if (!res.ok) {
    if (
      res.status === 409 &&
      data &&
      typeof data === 'object' &&
      (data.code === 'presentation_context_changed' ||
        data.code === 'presentation_session_invalid')
    ) {
      blockPresentationContext();
    }
    throw new HttpError(res.status, url, data);
  }
  if (isUserBootstrap && responseContext && !presentationBlocked) {
    rememberPresentationContext(responseContext);
  }
  return data as T;
}

// POST convenience wrapper; inherits fetchJson's error handling and auth redirection
export const postJson = <T>(
  url: string,
  body: unknown,
  signal?: AbortSignal
): Promise<T> =>
  fetchJson<T>(url, { body: JSON.stringify(body), method: 'POST' }, signal);
