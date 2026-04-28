import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { NotificationBanner } from '@/components/NotificationBanner.tsx';
import { server } from '@/test/mswUtils.ts';

afterEach(cleanup);

function renderWithClient(node: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
  );
}

describe('NotificationBanner', () => {
  it('renders nothing when the notification is disabled', async () => {
    server.use(
      http.get('/api/notification', () =>
        HttpResponse.json({
          enabled: false,
          message: 'Hidden because disabled',
          updatedOn: null,
        })
      )
    );

    renderWithClient(<NotificationBanner />);

    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    );
  });

  it('renders nothing when the message is empty', async () => {
    server.use(
      http.get('/api/notification', () =>
        HttpResponse.json({ enabled: true, message: '', updatedOn: null })
      )
    );

    renderWithClient(<NotificationBanner />);

    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    );
  });

  it('renders the message when enabled and populated', async () => {
    server.use(
      http.get('/api/notification', () =>
        HttpResponse.json({
          enabled: true,
          message: 'Heads up: data may be stale',
          updatedOn: '2026-04-27T12:00:00Z',
        })
      )
    );

    renderWithClient(<NotificationBanner />);

    expect(
      await screen.findByText('Heads up: data may be stale')
    ).toBeInTheDocument();
  });
});
