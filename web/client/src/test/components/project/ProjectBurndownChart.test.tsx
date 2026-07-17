import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  BalanceYAxisTick,
  VerticalMarkerLabel,
  buildChartRows,
  buildBalanceAxisTicks,
  formatBalanceAxisTick,
  getAwardStartMonth,
  getAwardEndMonth,
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

  it('renders a label above a vertical marker', () => {
    render(
      <svg>
        <VerticalMarkerLabel labelText="Project End" viewBox={{ x: 40, y: 20 }} />
      </svg>
    );

    const label = screen.getByText('Project End');

    expect(label).toHaveAttribute('x', '40');
    expect(label).toHaveAttribute('y', '14');
  });

  it('gets award months from date-only or date-time values', () => {
    expect(getAwardStartMonth('2026-04-01')).toBe('2026-04');
    expect(getAwardEndMonth('2026-07-31')).toBe('2026-07');
    expect(getAwardEndMonth('2026-08-15T00:00:00Z')).toBe('2026-08');
    expect(getAwardEndMonth(null)).toBeNull();
    expect(getAwardEndMonth('not-a-date')).toBeNull();
    expect(getAwardEndMonth('2026-02-31')).toBeNull();
  });

  it('pads chart rows so the x-axis spans project start through end', () => {
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
        ],
      },
    ];

    const rows = buildChartRows(series, '2026-03', '2026-07');

    expect(rows.map((row) => row.month)).toEqual([
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
    ]);
    expect(rows[0].label).toBe('Mar-26');
    expect(rows.at(-1)?.label).toBe('Jul-26');
    expect(rows[2]['All Expenses::solid']).toBe(90);
  });
});
