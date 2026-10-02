import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import {
  BalanceYAxisTick,
  ProjectBurndownSection,
  VerticalMarkerLabel,
  buildChartRows,
  buildBalanceAxisTicks,
  formatBalanceAxisTick,
  getDateMonthIndex,
  getBalanceStatClassName,
  getRollingStartMonthIndex,
  getTimelineEndMonthIndex,
  getTimelineProjectionDate,
  getVerticalMarkerStroke,
  getVerticalMarkerStrokeOpacity,
  shouldStaggerMarkerLabels,
} from '@/components/project/ProjectBurndownChart.tsx';
import type { ProjectionSeries } from '@/lib/projectProjection.ts';
import type { ProjectProjectionResult } from '@/queries/projectProjection.ts';
import { server } from '@/test/mswUtils.ts';

afterEach(cleanup);

const monthIndex = (year: number, month: number) => year * 12 + month - 1;

describe('ProjectBurndownChart axis helpers', () => {
  it('formats zero as dollars and compactly formats positive and negative ticks', () => {
    expect(formatBalanceAxisTick(0)).toBe('$0');
    expect(formatBalanceAxisTick(12_000)).toBe('$12k');
    expect(formatBalanceAxisTick(-12_000)).toBe('-$12k');
  });

  it('includes zero in the generated y-axis ticks', () => {
    expect(buildBalanceAxisTicks(-17_000, 42_000)).toContain(0);
  });

  it('colors negative y-axis ticks with the error color', () => {
    render(
      <svg>
        <BalanceYAxisTick payload={{ value: -12_000 }} x={20} y={20} />
        <BalanceYAxisTick payload={{ value: 12_000 }} x={20} y={40} />
      </svg>
    );

    expect(screen.getByText('-$12k')).toHaveAttribute(
      'fill',
      'var(--color-error)'
    );
    expect(screen.getByText('$12k')).toHaveAttribute('fill', 'currentColor');
  });

  it('colors negative balance stats with the error text class', () => {
    expect(getBalanceStatClassName(-1)).toBe('stat-value text-error');
    expect(getBalanceStatClassName(0)).toBe('stat-value');
    expect(getBalanceStatClassName(1)).toBe('stat-value');
  });

  it('uses error color for negative vertical markers and neutral grey otherwise', () => {
    expect(getVerticalMarkerStroke(-1)).toBe('var(--color-error)');
    expect(getVerticalMarkerStroke(0)).toBe('var(--color-base-content)');
    expect(getVerticalMarkerStroke(1)).toBe('var(--color-base-content)');
    expect(getVerticalMarkerStrokeOpacity(-1)).toBe(0.7);
    expect(getVerticalMarkerStrokeOpacity(1)).toBe(0.28);
  });

  it('renders a centered label above a vertical marker by default', () => {
    render(
      <svg>
        <VerticalMarkerLabel labelText="Today" viewBox={{ x: 40, y: 20 }} />
      </svg>
    );

    const label = screen.getByText('Today');

    expect(label).toHaveAttribute('x', '40');
    expect(label).toHaveAttribute('y', '14');
    expect(label).toHaveAttribute('text-anchor', 'middle');
  });

  it('right-aligns a vertical marker label inside the marker line', () => {
    render(
      <svg>
        <VerticalMarkerLabel
          align="end"
          labelText="Project End"
          viewBox={{ x: 40, y: 20 }}
        />
      </svg>
    );

    const label = screen.getByText('Project End');

    expect(label).toHaveAttribute('x', '36');
    expect(label).toHaveAttribute('y', '14');
    expect(label).toHaveAttribute('text-anchor', 'end');
  });

  it('supports vertically staggering a marker label', () => {
    render(
      <svg>
        <VerticalMarkerLabel
          labelText="Project End"
          verticalOffset={-22}
          viewBox={{ x: 40, y: 32 }}
        />
      </svg>
    );

    expect(screen.getByText('Project End')).toHaveAttribute('y', '10');
  });

  it('staggers marker labels only when their months overlap or are adjacent', () => {
    expect(
      shouldStaggerMarkerLabels(monthIndex(2026, 6), monthIndex(2026, 6))
    ).toBe(true);
    expect(
      shouldStaggerMarkerLabels(monthIndex(2026, 6), monthIndex(2026, 7))
    ).toBe(true);
    expect(
      shouldStaggerMarkerLabels(monthIndex(2026, 6), monthIndex(2026, 8))
    ).toBe(false);
    expect(shouldStaggerMarkerLabels(monthIndex(2026, 6), null)).toBe(false);
  });

  it('gets award month indexes from date-only or date-time values', () => {
    expect(getDateMonthIndex('2026-07-31')).toBe(monthIndex(2026, 7));
    expect(getDateMonthIndex('2026-08-15T00:00:00Z')).toBe(monthIndex(2026, 8));
    expect(getDateMonthIndex('2026-02-31')).toBeNull();
    expect(getDateMonthIndex(null)).toBeNull();
  });

  it('gets the rolling x-axis start three months before the reference month', () => {
    expect(getRollingStartMonthIndex(monthIndex(2026, 6))).toBe(
      monthIndex(2026, 3)
    );
    expect(getRollingStartMonthIndex(monthIndex(2026, 1))).toBe(
      monthIndex(2025, 10)
    );
    expect(getRollingStartMonthIndex(null)).toBeNull();
  });

  it('gets the rolling x-axis start six months back when six months of history is selected', () => {
    expect(getRollingStartMonthIndex(monthIndex(2026, 6), 6)).toBe(
      monthIndex(2025, 12)
    );
    expect(getRollingStartMonthIndex(null, 6)).toBeNull();
  });

  it('gets the rolling x-axis start twelve months back when twelve months of history is selected', () => {
    expect(getRollingStartMonthIndex(monthIndex(2026, 6), 12)).toBe(
      monthIndex(2025, 6)
    );
  });

  it('does not start the rolling x-axis before the award start month', () => {
    expect(
      getRollingStartMonthIndex(monthIndex(2026, 6), 12, monthIndex(2026, 2))
    ).toBe(monthIndex(2026, 2));
    expect(
      getRollingStartMonthIndex(monthIndex(2026, 6), 3, monthIndex(2025, 1))
    ).toBe(monthIndex(2026, 3));
    expect(
      getRollingStartMonthIndex(monthIndex(2026, 6), 12, monthIndex(2026, 9))
    ).toBe(monthIndex(2025, 6));
  });

  it('gets timeline end months from project end or fixed projection windows', () => {
    expect(
      getTimelineEndMonthIndex(
        'project-end',
        monthIndex(2026, 7),
        monthIndex(2026, 6)
      )
    ).toBe(monthIndex(2026, 7));
    expect(
      getTimelineEndMonthIndex(
        '12-months',
        monthIndex(2026, 7),
        monthIndex(2026, 6)
      )
    ).toBe(monthIndex(2027, 6));
    expect(
      getTimelineEndMonthIndex(
        '18-months',
        monthIndex(2026, 7),
        monthIndex(2026, 6)
      )
    ).toBe(monthIndex(2027, 12));
    expect(
      getTimelineEndMonthIndex(
        '24-months',
        monthIndex(2026, 7),
        monthIndex(2026, 6)
      )
    ).toBe(monthIndex(2028, 6));
    expect(
      getTimelineEndMonthIndex('12-months', monthIndex(2026, 7), null)
    ).toBeNull();
  });

  it('gets the projection target date for the selected timeline', () => {
    expect(
      getTimelineProjectionDate(
        'project-end',
        '2026-07-31',
        monthIndex(2026, 6)
      )
    ).toBe('2026-07-31');
    expect(
      getTimelineProjectionDate('12-months', '2026-07-31', monthIndex(2026, 6))
    ).toBe('2027-06-01');
    expect(
      getTimelineProjectionDate('12-months', '2026-07-31', null)
    ).toBeNull();
  });

  it('pads chart rows so the x-axis spans the rolling start through project end', () => {
    const series: ProjectionSeries[] = [
      {
        key: 'All Expenses',
        points: [
          {
            actualAmount: 10,
            displayPeriod: 'May-26',
            kind: 'actual',
            month: '2026-05',
            projectedAmount: 0,
            remaining: 90,
          },
          {
            actualAmount: 0,
            displayPeriod: 'Sep-26',
            kind: 'projected',
            month: '2026-09',
            projectedAmount: 10,
            remaining: 70,
          },
        ],
      },
    ];

    const rows = buildChartRows(
      series,
      getRollingStartMonthIndex(monthIndex(2026, 6)),
      monthIndex(2026, 7)
    );

    expect(rows.map((row) => row.month)).toEqual([
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
    ]);
    expect(rows.map((row) => row.month)).not.toContain('2026-09');
    expect(rows[0].label).toBe('Mar-26');
    expect(rows.at(-1)?.label).toBe('Jul-26');
    expect(rows[2]['All Expenses::solid']).toBe(90);
  });
});

describe('ProjectBurndownSection history', () => {
  const projection: ProjectProjectionResult = {
    categories: [
      {
        budget: 1000,
        committed: 0,
        expenditureCategory: '01 - Salaries and Wages',
        isPersonnel: 1,
        remainingNow: 800,
        spentToDate: 200,
      },
    ],
    periods: [
      {
        actualAmount: 100,
        displayPeriod: 'May-26',
        expenditureCategory: '01 - Salaries and Wages',
        isPersonnel: 1,
        kind: 'actual',
        month: '2026-05',
        projectedAmount: 0,
        remaining: 800,
      },
      {
        actualAmount: 0,
        displayPeriod: 'Jun-26',
        expenditureCategory: '01 - Salaries and Wages',
        isPersonnel: 1,
        kind: 'blended',
        month: '2026-06',
        projectedAmount: 100,
        remaining: 700,
      },
    ],
  };

  it('requests six months of history when selected', async () => {
    const requestedHistoryMonths: (string | null)[] = [];
    server.use(
      http.get('/api/project/projection/:projectNumber', ({ request }) => {
        requestedHistoryMonths.push(
          new URL(request.url).searchParams.get('historyMonths')
        );
        return HttpResponse.json(projection);
      })
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ProjectBurndownSection
          awardEndDate="2027-06-30"
          awardStartDate="2024-01-01"
          projectNumber="P1"
        />
      </QueryClientProvider>
    );

    const historySelect = await screen.findByRole('combobox', {
      name: /History/,
    });
    fireEvent.click(historySelect);
    fireEvent.click(screen.getByRole('option', { name: '6 months' }));

    await expect.poll(() => requestedHistoryMonths).toEqual(['3', '6']);
    expect(historySelect).toHaveTextContent('6 months');
  });
});
