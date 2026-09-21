import { init as initApm } from '@elastic/apm-rum';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyRumRouteMetadata,
  applyRumUserIdentity,
  bootstrapRum,
  resetRumForTests,
  resolveRumRouteMetadata,
  type RumPublicConfig,
} from '@/lib/rum.ts';

const enabledConfig: RumPublicConfig = {
  enabled: true,
  environment: 'production',
  serverUrl: 'https://elastic.example',
  serviceName: 'walter-web',
  serviceVersion: '1.2.3',
  transactionSampleRate: 0.2,
};

describe('bootstrapRum', () => {
  beforeEach(() => {
    resetRumForTests();
    vi.restoreAllMocks();
  });

  it('is a no-op when the server disables rum', async () => {
    const init = vi.fn();

    const result = await bootstrapRum({
      fetchConfig: async () => ({ ...enabledConfig, enabled: false }),
      init,
    });

    expect(result).toBeNull();
    expect(init).not.toHaveBeenCalled();
  });

  it('initializes the agent once', async () => {
    const agent = createFakeAgent();
    const init = vi.fn(() => agent);
    const fetchConfig = vi.fn(async () => enabledConfig);

    const first = await bootstrapRum({
      fetchConfig,
      getOrigin: () => 'https://walter.example',
      init,
    });

    const second = await bootstrapRum({
      fetchConfig,
      getOrigin: () => 'https://walter.example',
      init,
    });

    expect(first).toBe(agent);
    expect(second).toBe(agent);
    expect(fetchConfig).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledTimes(1);
    expect(agent.addFilter).toHaveBeenCalledTimes(1);
  });

  it('replays the latest route when config arrives after the router resolves', async () => {
    let resolveConfig!: (config: RumPublicConfig) => void;
    const configPromise = new Promise<RumPublicConfig>((resolve) => {
      resolveConfig = resolve;
    });
    const addLabels = vi.fn();
    const agent = createFakeAgent({
      currentTransaction: { addLabels, name: 'Unknown', type: 'page-load' },
    });
    const init = vi.fn(() => agent);
    const pending = bootstrapRum({ fetchConfig: () => configPromise, init });

    applyRumRouteMetadata({
      pathname: '/',
      routeGroup: 'home',
      routeTemplate: '/',
    });
    applyRumRouteMetadata({
      pathname: '/projects/123/P456',
      routeGroup: 'projects',
      routeTemplate: '/projects/$iamId/$projectNumber',
    });
    expect(init).not.toHaveBeenCalled();

    resolveConfig(enabledConfig);
    await pending;

    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        pageLoadTransactionName: '/projects/$iamId/$projectNumber',
      })
    );
    expect(agent.currentTransaction?.name).toBe(
      '/projects/$iamId/$projectNumber'
    );
    expect(addLabels).toHaveBeenCalledWith({
      route_group: 'projects',
      route_template: '/projects/$iamId/$projectNumber',
    });
    expect(agent.setCustomContext).toHaveBeenCalledWith({
      pathname: '/projects/$iamId/$projectNumber',
    });
    expect(agent.setInitialPageLoadName).toHaveBeenCalledWith(
      '/projects/$iamId/$projectNumber'
    );
  });

  it('retries after a transient config fetch failure', async () => {
    const agent = createFakeAgent();
    const init = vi.fn(() => agent);
    const fetchConfig = vi
      .fn<() => Promise<RumPublicConfig | null>>()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(enabledConfig);

    const first = await bootstrapRum({
      fetchConfig,
      getOrigin: () => 'https://walter.example',
      init,
    });

    const second = await bootstrapRum({
      fetchConfig,
      getOrigin: () => 'https://walter.example',
      init,
    });

    expect(first).toBeNull();
    expect(second).toBe(agent);
    expect(fetchConfig).toHaveBeenCalledTimes(2);
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('passes the expected config to Elastic and merges the current origin', async () => {
    const agent = createFakeAgent();
    const init = vi.fn(() => agent);

    await bootstrapRum({
      fetchConfig: async () => enabledConfig,
      getOrigin: () => 'https://walter.example',
      init,
    });

    expect(init).toHaveBeenCalledWith({
      breakdownMetrics: true,
      centralConfig: false,
      distributedTracingOrigins: ['https://walter.example'],
      environment: 'production',
      serverUrl: 'https://elastic.example',
      serviceName: 'walter-web',
      serviceVersion: '1.2.3',
      transactionSampleRate: 0.2,
    });
  });

  it('attaches route metadata to the active transaction', async () => {
    const addLabels = vi.fn();
    const setCustomContext = vi.fn();
    const agent = createFakeAgent({
      currentTransaction: {
        addLabels,
        name: '/initial',
        type: 'route-change',
      },
      setCustomContext,
    });

    await bootstrapRum({
      fetchConfig: async () => enabledConfig,
      getOrigin: () => 'https://walter.example',
      init: vi.fn(() => agent),
    });

    applyRumRouteMetadata({
      pathname: '/projects/123/P456',
      routeGroup: 'projects',
      routeTemplate: '/projects/$employeeId/$projectNumber',
    });

    expect(agent.currentTransaction?.name).toBe(
      '/projects/$employeeId/$projectNumber'
    );
    expect(addLabels).toHaveBeenCalledWith({
      route_group: 'projects',
      route_template: '/projects/$employeeId/$projectNumber',
    });
    expect(setCustomContext).toHaveBeenCalledWith({
      pathname: '/projects/$employeeId/$projectNumber',
    });
  });
});

describe('RUM user identity', () => {
  beforeEach(() => resetRumForTests());

  it('applies identity already available before bootstrap', async () => {
    const agent = createFakeAgent();
    applyRumUserIdentity(' 001234567 ');
    await bootstrapRum({
      fetchConfig: async () => enabledConfig,
      init: () => agent,
    });
    expect(agent.setUserContext).toHaveBeenLastCalledWith({ id: '001234567' });
  });

  it('replays only the latest identity while configuration is loading', async () => {
    const agent = createFakeAgent();
    let resolveConfig!: (config: RumPublicConfig) => void;
    const configPromise = new Promise<RumPublicConfig>((resolve) => {
      resolveConfig = resolve;
    });
    const pending = bootstrapRum({
      fetchConfig: () => configPromise,
      init: () => agent,
    });
    applyRumUserIdentity('001234567');
    applyRumUserIdentity('009876543');
    expect(agent.setUserContext).not.toHaveBeenCalled();
    resolveConfig(enabledConfig);
    await pending;
    expect(agent.setUserContext).toHaveBeenCalledExactlyOnceWith({
      id: '009876543',
    });
  });

  it('does not replay an identity cleared during startup', async () => {
    const agent = createFakeAgent();
    applyRumUserIdentity('001234567');
    applyRumUserIdentity(null);
    await bootstrapRum({
      fetchConfig: async () => enabledConfig,
      init: () => agent,
    });
    expect(agent.setUserContext).toHaveBeenCalledExactlyOnceWith({ id: '' });
  });

  it('adds and replaces identity after initialization', async () => {
    const agent = createFakeAgent();
    await bootstrapRum({
      fetchConfig: async () => enabledConfig,
      init: () => agent,
    });
    expect(agent.setUserContext).toHaveBeenLastCalledWith({ id: '' });
    applyRumUserIdentity('001234567');
    expect(agent.setUserContext).toHaveBeenLastCalledWith({ id: '001234567' });
    applyRumUserIdentity('009876543');
    expect(agent.setUserContext).toHaveBeenLastCalledWith({ id: '009876543' });
  });

  it.each([null, undefined, '', '   '])(
    'clears identity for %s',
    async (missing) => {
      const agent = createFakeAgent();
      await bootstrapRum({
        fetchConfig: async () => enabledConfig,
        init: () => agent,
      });
      applyRumUserIdentity('001234567');
      applyRumUserIdentity(missing);
      expect(agent.setUserContext).toHaveBeenLastCalledWith({ id: '' });
    }
  );

  it('does not initialize a disabled agent when identity changes', async () => {
    const init = vi.fn();
    applyRumUserIdentity('001234567');
    await bootstrapRum({
      fetchConfig: async () => ({ ...enabledConfig, enabled: false }),
      init,
    });
    applyRumUserIdentity('009876543');
    applyRumUserIdentity(null);
    expect(init).not.toHaveBeenCalled();
  });

  it('overwrites the installed Elastic agent identity when clearing', async () => {
    // Use the real context implementation without instrumentation or network intake.
    const agent = initApm({ active: false, logLevel: 'error' });
    const config = agent.serviceFactory.getService('ConfigService') as {
      get: (key: string) => { user: { id: string } };
    };
    await bootstrapRum({
      fetchConfig: async () => enabledConfig,
      init: () => agent,
    });
    applyRumUserIdentity('001234567');
    expect(config.get('context').user.id).toBe('001234567');
    applyRumUserIdentity(null);
    expect(config.get('context').user.id).toBe('');
  });

  it('keeps user context and report selections while filtering credentials', async () => {
    const agent = createFakeAgent();
    await bootstrapRum({
      fetchConfig: async () => enabledConfig,
      init: () => agent,
    });
    applyRumUserIdentity('001234567');
    const filter = agent.addFilter.mock.calls[0][0];
    const payload = {
      transactions: [
        {
          context: {
            page: {
              url: 'https://walter.example/reports?period=202609&depts=ABCD&token=secret',
            },
            user: { id: '001234567' },
          },
          name: '/reports',
          type: 'route-change',
        },
      ],
    };
    const filtered = filter(payload);
    expect(filtered.transactions[0].context.user).toEqual({ id: '001234567' });
    const url = new URL(filtered.transactions[0].context.page.url);
    expect(url.searchParams.get('period')).toBe('202609');
    expect(url.searchParams.get('depts')).toBe('ABCD');
    expect(url.searchParams.get('token')).not.toBe('secret');
  });
});

describe('resolveRumRouteMetadata', () => {
  it('uses the leaf route full path and derives a route group', () => {
    expect(
      resolveRumRouteMetadata(
        [
          { fullPath: '/', routeId: '__root__' },
          { fullPath: '/projects', routeId: '/(authenticated)/projects' },
          {
            fullPath: '/projects/$employeeId/$projectNumber',
            routeId: '/(authenticated)/projects/$employeeId/$projectNumber',
          },
        ],
        '/projects/123/P456'
      )
    ).toEqual({
      pathname: '/projects/123/P456',
      routeGroup: 'projects',
      routeTemplate: '/projects/$employeeId/$projectNumber',
    });
  });
});

function createFakeAgent(overrides?: {
  currentTransaction?: {
    addLabels?: ReturnType<typeof vi.fn>;
    name: string;
    type: string;
  };
  setCustomContext?: ReturnType<typeof vi.fn>;
}) {
  const agent = {
    addFilter: vi.fn(),
    addLabels: vi.fn(),
    currentTransaction: overrides?.currentTransaction,
    getCurrentTransaction: vi.fn(() => agent.currentTransaction),
    setCustomContext: overrides?.setCustomContext ?? vi.fn(),
    setInitialPageLoadName: vi.fn(),
    setUserContext: vi.fn(),
  };

  return agent;
}
