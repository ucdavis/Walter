import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  BalanceYAxisTick,
  VerticalMarkerLabel,
  buildBalanceAxisTicks,
  formatBalanceAxisTick,
  getAwardEndMonth,
} from '@/components/project/ProjectBurndownChart.tsx';

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

  it('gets the award end month from date-only or date-time values', () => {
    expect(getAwardEndMonth('2026-07-31')).toBe('2026-07');
    expect(getAwardEndMonth('2026-08-15T00:00:00Z')).toBe('2026-08');
    expect(getAwardEndMonth(null)).toBeNull();
    expect(getAwardEndMonth('not-a-date')).toBeNull();
  });
});
