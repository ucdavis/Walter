import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { ExpenditureCategoryBreakdown } from '@/components/project/ExpenditureCategoryBreakdown.tsx';
import { server } from '@/test/mswUtils.ts';

afterEach(cleanup);
afterEach(() => {
  vi.useRealTimers();
});

function renderWithQueryClient(node: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
  );
}

describe('ExpenditureCategoryBreakdown', () => {
  it('renders progress categories when table rows are empty', async () => {
    server.use(
      http.get('/api/project/projection/:projectNumber', () =>
        HttpResponse.json({
          categories: [
            {
              budget: 100,
              committed: 10,
              expenditureCategory: '04 - Projection Supplies',
              isPersonnel: 0,
              remainingNow: 70,
              spentToDate: 20,
            },
          ],
          periods: [],
        })
      )
    );

    renderWithQueryClient(
      <ExpenditureCategoryBreakdown
        progressEnabled={true}
        projectNumber="P1"
        records={[]}
      />
    );

    expect(await screen.findByText('Projection Supplies')).toBeInTheDocument();
    expect(
      screen.queryByText('No expenditure category data found.')
    ).not.toBeInTheDocument();
  });

  it('shows the balance and time remaining summary in progress view', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 1));

    server.use(
      http.get('/api/project/projection/:projectNumber', () =>
        HttpResponse.json({
          categories: [
            {
              budget: 100,
              committed: 20,
              expenditureCategory: '04 - Projection Supplies',
              isPersonnel: 0,
              remainingNow: -25,
              spentToDate: 105,
            },
          ],
          periods: [],
        })
      )
    );

    renderWithQueryClient(
      <ExpenditureCategoryBreakdown
        awardEndDate="2026-07-31"
        awardStartDate="2026-01-01"
        progressEnabled={true}
        projectNumber="P1"
        records={[]}
      />
    );

    const summary = await screen.findByText(
      (_, element) =>
        element?.tagName.toLowerCase() === 'p' &&
        element.textContent ===
          'Balance is $25.00 (25%) over, with 0 months (0%) remaining.'
    );

    expect(summary).toBeInTheDocument();
    expect(summary.querySelector('strong')).toHaveClass('text-error');
  });
});
