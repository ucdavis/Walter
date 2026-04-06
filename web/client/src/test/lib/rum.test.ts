import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyRumRouteMetadata,
  bootstrapRum,
  resetRumForTests,
  resolveRumRouteMetadata,
  type RumPublicConfig,
} from '@/lib/rum.ts';

const enabledConfig: RumPublicConfig = {
  distributedTracingOrigins: ['https://walter.example'],
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
  });

  it('passes the expected config to Elastic and merges the current origin', async () => {
    const agent = createFakeAgent();
    const init = vi.fn(() => agent);

    await bootstrapRum({
      fetchConfig: async () => ({
        ...enabledConfig,
        distributedTracingOrigins: ['https://api.example'],
      }),
      getOrigin: () => 'https://walter.example',
      init,
    });

    expect(init).toHaveBeenCalledWith({
      breakdownMetrics: true,
      centralConfig: false,
      distributedTracingOrigins: [
        'https://walter.example',
        'https://api.example',
      ],
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
      pathname: '/projects/123/P456',
    });
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
    addLabels: vi.fn(),
    currentTransaction: overrides?.currentTransaction,
    getCurrentTransaction: vi.fn(() => agent.currentTransaction),
    setCustomContext: overrides?.setCustomContext ?? vi.fn(),
    setInitialPageLoadName: vi.fn(),
  };

  return agent;
}
