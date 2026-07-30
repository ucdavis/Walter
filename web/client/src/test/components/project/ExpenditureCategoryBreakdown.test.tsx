import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { ExpenditureCategoryBreakdown } from '@/components/project/ExpenditureCategoryBreakdown.tsx';
import { server } from '@/test/mswUtils.ts';

afterEach(cleanup);

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
});
