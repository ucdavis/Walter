import { describe, expect, it } from 'vitest';
import { createRumPrivacyFilter } from '@/lib/rumPrivacy.ts';

const origin = 'https://walter.example';
const filter = createRumPrivacyFilter(origin, [
  '/',
  '/projects/$iamId',
  '/projects/$iamId/$projectNumber',
  '/projects/by-number/$projectNumber',
  '/reports',
]);

describe('RUM payload privacy', () => {
  it('keeps report details and readable request/error URLs while grouping page timings by route', () => {
    const pageUrl = `${origin}/projects/123/P456?period=2026-08&funds=123&token=secret-token#totals`;
    const requestUrl = `${origin}/api/project/transactions?projectCodes=P456,P789&api_key=secret-key`;
    const payload = {
      errors: [
        {
          context: { page: { referer: pageUrl, url: pageUrl } },
          culprit: pageUrl,
          exception: {
            message: `Failed request ${requestUrl}`,
            stacktrace: [
              {
                abs_path: `${origin}/assets/index-abc.js?v=2&access_token=secret-stack`,
                colno: 4,
                filename: 'src/report.ts',
                lineno: 12,
              },
            ],
            type: 'Error',
          },
          id: 'error-789',
        },
      ],
      transactions: [
        {
          context: {
            custom: { pathname: '/projects/$iamId/$projectNumber' },
            page: {
              referer:
                'https://other.example/report?dept=CAES&password=secret-password',
              url: pageUrl,
            },
            tags: { route_template: '/projects/$iamId/$projectNumber' },
          },
          duration: 123,
          id: 'trace-123',
          name: '/projects/123/P456',
          spans: [
            {
              context: {
                http: { method: 'GET', status_code: 200, url: requestUrl },
              },
              duration: 50,
              id: 'span-456',
              name: `GET ${requestUrl}`,
            },
          ],
          type: 'page-load',
        },
      ],
    };

    expect(filter(payload)).toBe(payload);
    expect(JSON.stringify(payload)).not.toContain('secret-');
    expect(payload.transactions[0]).toMatchObject({
      context: {
        custom: { pathname: '/projects/$iamId/$projectNumber' },
        page: {
          referer: 'https://other.example/report?dept=CAES',
          url: `${origin}/projects/123/P456?period=2026-08&funds=123#totals`,
        },
        tags: { route_template: '/projects/$iamId/$projectNumber' },
      },
      duration: 123,
      id: 'trace-123',
      name: '/projects/$iamId/$projectNumber',
      spans: [
        {
          context: {
            http: {
              method: 'GET',
              status_code: 200,
              url: `${origin}/api/project/transactions?projectCodes=P456,P789`,
            },
          },
          duration: 50,
          id: 'span-456',
          name: `GET ${origin}/api/project/transactions?projectCodes=P456,P789`,
        },
      ],
    });
    expect(payload.errors[0].exception.message).toBe(
      `Failed request ${origin}/api/project/transactions?projectCodes=P456,P789`
    );
    expect(payload.errors[0].exception.stacktrace[0]).toEqual({
      abs_path: `${origin}/assets/index-abc.js?v=2`,
      colno: 4,
      filename: 'src/report.ts',
      lineno: 12,
    });
  });

  it.each([
    '/reports/department-balances?period=2026-08&depts=A,B&funds=123&accounts=456&fields=period%2Cfund',
    '/reports/reconciliation/P456/detail?dept=CAES&fund=123&program=P1&activity=A1',
    '/api/project/personnel?iamId=123&projectCodes=P456,P789',
    '/unknown/path?code=P456&key=fund&tokenCount=10',
    '//other.example/reports?period=2026-08#totals',
    'https://other.example/assets/report.js?v=2',
    '/reports?filter=a%20b&filter=c+d&empty=&flag#section?tab=details',
    '/reports?question=why?now#details',
    'webpack:///src/report.ts',
    'src/report.ts',
    '',
  ])('preserves the non-secret URL %s exactly', (url) => {
    const payload = {
      errors: [],
      transactions: [{ context: { page: { url } } }],
    };
    filter(payload);
    expect(payload.transactions[0].context.page.url).toBe(url);
  });

  it.each([
    [
      'https://alice:secret-password@walter.example/reports?period=2026-08',
      `${origin}/reports?period=2026-08`,
    ],
    [
      '//alice:secret-password@other.example/reports',
      '//other.example/reports',
    ],
    [
      '/reports?access_token=secret-1&fund=123&ACCESS-TOKEN=secret-2&api%5Fkey=secret-3',
      '/reports?fund=123',
    ],
    ['/reports?token=secret#totals', '/reports#totals'],
    [
      '/reports#access_token=secret&id_token=secret2&period=2026-08',
      '/reports#period=2026-08',
    ],
    [
      '/reports#/detail?period=2026-08&token=secret',
      '/reports#/detail?period=2026-08',
    ],
    [
      '/signin-oidc?code=secret-auth-code&state=correlation',
      '/signin-oidc?state=correlation',
    ],
    ['/callback#code=secret-auth-code', '/callback'],
    [
      '/reports?code=P456&authorization_code=secret-auth-code',
      '/reports?code=P456',
    ],
    ['http://[invalid?token=secret&fund=123', 'http://[invalid?fund=123'],
  ])('removes only credentials from %s', (url, expected) => {
    const payload = {
      errors: [],
      transactions: [{ context: { page: { url } } }],
    };
    filter(payload);
    expect(payload.transactions[0].context.page.url).toBe(expected);
  });

  it('keeps request names relative and does not normalize non-navigation transactions', () => {
    const payload = {
      errors: [],
      transactions: [
        {
          context: { page: { url: `${origin}/projects/123/P456?fund=123` } },
          name: 'GET /api/project/transactions?projectCodes=P456&token=secret',
          type: 'http-request',
        },
      ],
    };
    filter(payload);
    expect(payload.transactions[0].name).toBe(
      'GET /api/project/transactions?projectCodes=P456'
    );
  });

  it('groups static route alternatives correctly without rewriting event URLs', () => {
    const payload = {
      errors: [],
      transactions: [
        {
          context: {
            page: { url: `${origin}/projects/by-number/P456?fund=123` },
          },
          name: '/projects/by-number/P456',
          type: 'route-change',
        },
      ],
    };
    filter(payload);
    expect(payload.transactions[0].name).toBe(
      '/projects/by-number/$projectNumber'
    );
    expect(payload.transactions[0].context.page.url).toBe(
      `${origin}/projects/by-number/P456?fund=123`
    );
  });
});
