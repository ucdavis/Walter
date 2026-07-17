import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  BalanceYAxisTick,
  VerticalMarkerLabel,
  buildChartRows,
  buildBalanceAxisTicks,
  formatBalanceAxisTick,
  getAwardEndMonth,
  getBalanceStatClassName,
  getRollingStartMonth,
  getTimelineEndMonth,
  getTimelineProjectionDate,
  getVerticalMarkerStroke,
  getVerticalMarkerStrokeOpacity,
} from '@/components/project/ProjectBurndownChart.tsx';
import type { ProjectionSeries } from '@/lib/projectProjection.ts';

afterEach(cleanup);

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

  it('gets award months from date-only or date-time values', () => {
    expect(getAwardEndMonth('2026-07-31')).toBe('2026-07');
    expect(getAwardEndMonth('2026-08-15T00:00:00Z')).toBe('2026-08');
    expect(getAwardEndMonth(null)).toBeNull();
  });

  it('gets the rolling x-axis start three months before the reference month', () => {
    expect(getRollingStartMonth('2026-06')).toBe('2026-03');
    expect(getRollingStartMonth('2026-01')).toBe('2025-10');
    expect(getRollingStartMonth(null)).toBeNull();
  });

  it('gets timeline end months from project end or fixed projection windows', () => {
    expect(getTimelineEndMonth('project-end', '2026-07', '2026-06')).toBe(
      '2026-07'
    );
    expect(getTimelineEndMonth('12-months', '2026-07', '2026-06')).toBe(
      '2027-06'
    );
    expect(getTimelineEndMonth('18-months', '2026-07', '2026-06')).toBe(
      '2027-12'
    );
    expect(getTimelineEndMonth('24-months', '2026-07', '2026-06')).toBe(
      '2028-06'
    );
    expect(getTimelineEndMonth('12-months', '2026-07', null)).toBeNull();
  });

  it('gets the projection target date for the selected timeline', () => {
    expect(
      getTimelineProjectionDate('project-end', '2026-07-31', '2026-06')
    ).toBe('2026-07-31');
    expect(
      getTimelineProjectionDate('12-months', '2026-07-31', '2026-06')
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
      getRollingStartMonth('2026-06'),
      '2026-07'
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
