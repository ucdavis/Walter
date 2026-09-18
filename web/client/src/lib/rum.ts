import { init as initApm } from '@elastic/apm-rum';
import { createRumPrivacyFilter } from '@/lib/rumPrivacy.ts';

type RumInitConfig = Parameters<typeof initApm>[0];

interface RumTransaction {
  addLabels?: (labels: Record<string, string>) => void;
  name: string;
  type?: string;
}

interface RumAgent {
  addFilter: (filter: ReturnType<typeof createRumPrivacyFilter>) => void;
  addLabels?: (labels: Record<string, string>) => void;
  getCurrentTransaction?: () => RumTransaction | undefined;
  setCustomContext?: (context: Record<string, unknown>) => void;
  setInitialPageLoadName?: (name: string) => void;
}

export interface RumPublicConfig {
  enabled: boolean;
  environment: string;
  serverUrl: string;
  serviceName: string;
  serviceVersion: string;
  transactionSampleRate: number;
}

export interface RouteMatchLike {
  fullPath?: string;
  routeId?: string;
}

export interface RumRouteMetadata {
  pathname: string;
  routeGroup: string;
  routeTemplate: string;
}

interface BootstrapRumDependencies {
  fetchConfig?: () => Promise<RumPublicConfig | null>;
  getOrigin?: () => string;
  init?: (config: RumInitConfig) => RumAgent;
  routeTemplates?: string[];
}

let bootstrapPromise: Promise<RumAgent | null> | null = null;
let rumAgent: RumAgent | null = null;
let latestRouteMetadata: RumRouteMetadata | null = null;

export async function bootstrapRum(
  dependencies: BootstrapRumDependencies = {}
): Promise<RumAgent | null> {
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  const {
    fetchConfig = loadRumConfig,
    getOrigin = () => window.location.origin,
    init = initApm,
    routeTemplates = [],
  } = dependencies;

  bootstrapPromise = (async () => {
    try {
      const config = await fetchConfig();
      if (!config?.enabled) {
        return null;
      }

      const origin = getOrigin();
      rumAgent = init({
        breakdownMetrics: true,
        centralConfig: false,
        distributedTracingOrigins: [origin],
        environment: config.environment,
        serverUrl: config.serverUrl,
        serviceName: config.serviceName,
        serviceVersion: config.serviceVersion,
        transactionSampleRate: config.transactionSampleRate,
        ...(latestRouteMetadata && {
          pageLoadTransactionName: latestRouteMetadata.routeTemplate,
        }),
      }) as RumAgent;

      rumAgent.addFilter(createRumPrivacyFilter(origin, routeTemplates));
      if (latestRouteMetadata) {
        applyRumRouteMetadata(latestRouteMetadata);
      }

      return rumAgent;
    } catch {
      bootstrapPromise = null;
      return null;
    }
  })();

  return bootstrapPromise;
}

export function applyRumRouteMetadata(metadata: RumRouteMetadata): void {
  // The router can resolve while the runtime config request is still in flight.
  latestRouteMetadata = metadata;
  if (!rumAgent) {
    return;
  }

  const transaction = rumAgent.getCurrentTransaction?.();
  if (
    transaction &&
    (transaction.type === 'page-load' || transaction.type === 'route-change')
  ) {
    transaction.name = metadata.routeTemplate;
    transaction.addLabels?.({
      route_group: metadata.routeGroup,
      route_template: metadata.routeTemplate,
    });
  } else {
    rumAgent.addLabels?.({
      route_group: metadata.routeGroup,
      route_template: metadata.routeTemplate,
    });
  }

  rumAgent.setCustomContext?.({
    pathname: metadata.routeTemplate,
  });

  if (metadata.routeTemplate === '/' || transaction?.type === 'page-load') {
    rumAgent.setInitialPageLoadName?.(metadata.routeTemplate);
  }
}

export function resolveRumRouteMetadata(
  matches: RouteMatchLike[],
  pathname: string
): RumRouteMetadata {
  const routeTemplate = normalizeRouteTemplate(
    [...matches]
      .reverse()
      .find((match) => match.routeId !== '__root__' && match.fullPath)?.fullPath
  );

  return {
    pathname,
    routeGroup: getRouteGroup(routeTemplate),
    routeTemplate,
  };
}

export function resetRumForTests(): void {
  bootstrapPromise = null;
  rumAgent = null;
  latestRouteMetadata = null;
}

async function loadRumConfig(): Promise<RumPublicConfig | null> {
  const response = await fetch('/api/system/rum-config', {
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as RumPublicConfig;
}

function normalizeRouteTemplate(fullPath?: string): string {
  if (!fullPath || fullPath === '/') {
    return '/';
  }

  return fullPath.replace(/\/+$/, '') || '/';
}

function getRouteGroup(routeTemplate: string): string {
  if (routeTemplate === '/') {
    return 'home';
  }

  const segment = routeTemplate.split('/').filter(Boolean)[0];
  return segment?.startsWith('$') ? 'dynamic' : (segment ?? 'unknown');
}
