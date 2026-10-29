import { describe, expect, it } from 'vitest';
import { buildFundingChartData } from '@/components/projections/fundingChart.ts';
import type {
  FundingMonthProjection,
  FundingSource,
} from '@/components/projections/projection.ts';

const source: FundingSource = {
  color: '#62bd5b',
  endDate: '2026-12-31',
  id: 'nih',
  indirectRate: 10,
  name: 'NIH grant',
  startDate: '2026-01-01',
  startingBalance: 100_000,
};

const fundingMonths: FundingMonthProjection[] = [
  {
    active: true,
    deficit: false,
    drawdown: 12_000,
    month: '2026-01',
    remainingBalance: 88_000,
    sourceId: 'nih',
  },
  {
    active: true,
    deficit: true,
    drawdown: 4000,
    month: '2026-02',
    remainingBalance: -3000,
    sourceId: 'nih',
  },
  {
    active: false,
    deficit: false,
    drawdown: 0,
    month: '2026-03',
    remainingBalance: null,
    sourceId: 'nih',
  },
  {
    active: true,
    deficit: false,
    drawdown: 999,
    month: '2026-01',
    remainingBalance: 999,
    sourceId: 'other',
  },
];

describe('funding chart data', () => {
  it('maps active months to balance and negative drawdown expense points', () => {
    const data = buildFundingChartData(source, ['2026-01'], fundingMonths);

    expect(data[0]).toMatchObject({
      active: true,
      deficit: false,
      drawdown: 12_000,
      drawdownExpense: -12_000,
      month: '2026-01',
      monthLabel: 'Jan 2026',
      remainingBalance: 88_000,
    });
  });

  it('sets inactive months to null balance and zero drawdown', () => {
    const data = buildFundingChartData(
      source,
      ['2026-03', '2026-04'],
      fundingMonths
    );

    expect(data).toEqual([
      {
        active: false,
        deficit: false,
        drawdown: 0,
        drawdownExpense: 0,
        month: '2026-03',
        monthLabel: 'Mar 2026',
        remainingBalance: null,
      },
      {
        active: false,
        deficit: false,
        drawdown: 0,
        drawdownExpense: 0,
        month: '2026-04',
        monthLabel: 'Apr 2026',
        remainingBalance: null,
      },
    ]);
  });

  it('preserves negative balances for deficit months', () => {
    const data = buildFundingChartData(source, ['2026-02'], fundingMonths);

    expect(data[0]).toMatchObject({
      deficit: true,
      drawdownExpense: -4000,
      remainingBalance: -3000,
    });
  });
});
