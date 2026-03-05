import { HttpError } from '@/lib/api.ts';

export type ErrorPresentation = {
  detail?: string;
  message: string;
  statusCode?: number;
  title: string;
};

type ErrorPresentationOverrides = Partial<
  Record<number, Partial<ErrorPresentation>>
>;

const getHttpErrorDetail = (error: HttpError): string | undefined => {
  if (
    error.body &&
    typeof error.body === 'object' &&
    error.body !== null &&
    'message' in error.body
  ) {
    const message = String(
      (error.body as { message?: string | number }).message ?? ''
    ).trim();
    return message || undefined;
  }

  return undefined;
};

export function getErrorPresentation(
  error: unknown,
  overrides: ErrorPresentationOverrides = {}
): ErrorPresentation {
  if (error instanceof HttpError) {
    const detail = getHttpErrorDetail(error);

    const base: ErrorPresentation =
      error.status === 403
        ? {
            detail,
            message:
              'Walter can only show data that matches your current permissions.',
            statusCode: error.status,
            title: 'You do not have access to this page',
          }
        : error.status === 404
          ? {
              detail,
              message: 'The page or data you requested could not be found.',
              statusCode: error.status,
              title: 'We could not find that',
            }
          : error.status >= 500
            ? {
                detail,
                message:
                  'Try again in a moment. If the problem keeps happening, the service may be unavailable.',
                statusCode: error.status,
                title: 'We could not reach the server',
              }
            : {
                detail,
                message:
                  'Walter could not complete that request with the information available.',
                statusCode: error.status,
                title: 'We could not complete that request',
              };

    const override = overrides[error.status];
    const merged = {
      ...base,
      ...override,
    };

    if (merged.detail && merged.detail === merged.message) {
      merged.detail = undefined;
    }

    return merged;
  }

  if (error instanceof Error) {
    return {
      message:
        error.message ||
        'An unexpected error occurred while rendering this page.',
      title: 'Something went wrong',
    };
  }

  return {
    message: 'An unexpected error occurred while rendering this page.',
    title: 'Something went wrong',
  };
}
