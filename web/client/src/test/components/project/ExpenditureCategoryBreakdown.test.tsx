import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { ExpenditureCategoryBreakdown } from '@/components/project/ExpenditureCategoryBreakdown.tsx';
import type { ProjectRecord } from '@/queries/project.ts';
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
    expect(
      summary.compareDocumentPosition(
        screen.getByRole('button', { name: 'Table View' })
      ) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(
      screen.getByTestId('budget-vs-time-current-month-marker')
    ).toBeInTheDocument();
  });

  it('keeps the table expanded when switching from the expanded graph', () => {
    server.use(
      http.get('/api/project/projection/:projectNumber', () =>
        HttpResponse.json({ categories: [], periods: [] })
      )
    );

    renderWithQueryClient(
      <ExpenditureCategoryBreakdown
        progressEnabled={true}
        projectNumber="P1"
        records={[
          {
            balance: 70,
            budget: 100,
            commitments: 10,
            expenditureCategoryName: '04 - Supplies',
            expenses: 20,
          } as ProjectRecord,
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Expand graph' }));
    fireEvent.click(screen.getByRole('button', { name: 'Table View' }));

    expect(
      screen.getByRole('button', { name: 'Collapse table' })
    ).toBeInTheDocument();
  });

  it('keeps the graph expanded when switching from the expanded table', () => {
    server.use(
      http.get('/api/project/projection/:projectNumber', () =>
        HttpResponse.json({ categories: [], periods: [] })
      )
    );

    renderWithQueryClient(
      <ExpenditureCategoryBreakdown
        progressEnabled={true}
        projectNumber="P1"
        records={[
          {
            balance: 70,
            budget: 100,
            commitments: 10,
            expenditureCategoryName: '04 - Supplies',
            expenses: 20,
          } as ProjectRecord,
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Table View' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expand table' }));
    fireEvent.click(screen.getByRole('button', { name: 'Graph View' }));

    expect(
      screen.getByRole('button', { name: 'Collapse graph' })
    ).toBeInTheDocument();
  });
});
