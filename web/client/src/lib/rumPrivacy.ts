import type { ApmBase } from '@elastic/apm-rum';

type RumFilter = Parameters<ApmBase['addFilter']>[0];

const urlFields = new Set([
  'url',
  'referer',
  'referrer',
  'abs_path',
  'filename',
]);
// Exact names, ignoring case, hyphens, and underscores. Report codes are not secrets.
const secretParameters = new Set([
  'token',
  'accesstoken',
  'idtoken',
  'refreshtoken',
  'apikey',
  'password',
  'passwd',
  'clientsecret',
  'secret',
  'authorization',
  'authorizationcode',
  'authcode',
  'codeverifier',
  'samlresponse',
  'assertion',
  'sig',
]);

/** Filter credentials before serialization, keeping report inputs in event details. */
export function createRumPrivacyFilter(
  origin: string,
  routeTemplates: string[]
): RumFilter {
  const templates = [...new Set(routeTemplates.filter(Boolean))].sort(
    (left, right) => left.split('$').length - right.split('$').length
  );

  const sanitizeUrl = (value: string): string => {
    const hashIndex = value.indexOf('#');
    const beforeHash = hashIndex < 0 ? value : value.slice(0, hashIndex);
    const queryIndex = beforeHash.indexOf('?');
    const base = queryIndex < 0 ? beforeHash : beforeHash.slice(0, queryIndex);
    const query = queryIndex < 0 ? '' : beforeHash.slice(queryIndex + 1);
    let isAuthCallback = false;
    try {
      const { pathname } = new URL(base, origin);
      isAuthCallback =
        /\/(?:signin-oidc|callback|oauth2?\/(?:authorize|token))\/?$/i.test(
          pathname
        );
    } catch {
      // Even malformed URLs can have recognizable secret query parameters.
    }

    const filterParameters = (parameters: string): string =>
      parameters
        .split('&')
        .filter((part) => {
          const name = new URLSearchParams(part).keys().next().value ?? '';
          const normalized = name.replaceAll(/[_-]/g, '').toLowerCase();
          return (
            !secretParameters.has(normalized) &&
            !(isAuthCallback && normalized === 'code')
          );
        })
        .join('&');

    // Keep the original encoding, parameter order, and relative/absolute URL form.
    const cleanBase = base.replace(/^((?:https?:)?\/\/)[^#/?]*@/i, '$1');
    const cleanQuery = filterParameters(query);
    let cleanHash = hashIndex < 0 ? '' : value.slice(hashIndex + 1);
    // OAuth responses may put credentials in a fragment, including hash-router queries.
    const hashQuery = cleanHash.indexOf('?');
    if (hashQuery >= 0) {
      const parameters = filterParameters(cleanHash.slice(hashQuery + 1));
      cleanHash =
        cleanHash.slice(0, hashQuery) + (parameters ? `?${parameters}` : '');
    } else if (cleanHash.includes('=')) {
      cleanHash = filterParameters(cleanHash);
    }
    return (
      cleanBase +
      (cleanQuery ? `?${cleanQuery}` : '') +
      (cleanHash ? `#${cleanHash}` : '')
    );
  };

  const sanitizeText = (value: string): string => {
    const request = /^(get|post|put|patch|delete|head|options)\s+(.+)$/i.exec(
      value
    );
    if (request) {
      return `${request[1]} ${sanitizeUrl(request[2])}`;
    }
    if (value.startsWith('/')) {
      return sanitizeUrl(value);
    }
    return value.replaceAll(/https?:\/\/[^\s"'<>]+/gi, sanitizeUrl);
  };

  const scrub = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(scrub);
    } else if (value && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value)) {
        if (typeof entry === 'string') {
          (value as Record<string, unknown>)[key] = urlFields.has(key)
            ? sanitizeUrl(entry)
            : sanitizeText(entry);
        } else {
          scrub(entry);
        }
      }
    }
  };

  return (payload) => {
    // Group page timings by route, while retaining the actual URL on the event.
    for (const transaction of payload.transactions ?? []) {
      if (
        transaction.type !== 'page-load' &&
        transaction.type !== 'route-change'
      ) {
        continue;
      }
      const value: unknown = transaction.context?.page?.url ?? transaction.name;
      if (typeof value !== 'string') {
        continue;
      }
      try {
        const url = new URL(value, origin);
        if (url.origin !== origin) {
          continue;
        }
        const segments = url.pathname.split('/').filter(Boolean);
        const template = templates.find((candidate) => {
          const parts = candidate.split('/').filter(Boolean);
          return (
            parts.length === segments.length &&
            parts.every(
              (part, index) => part.startsWith('$') || part === segments[index]
            )
          );
        });
        if (template) {
          transaction.name = template.replace(/\/+$/, '') || '/';
        }
      } catch {
        // Leave non-URL transaction names unchanged.
      }
    }
    scrub(payload);
    return payload;
  };
}
