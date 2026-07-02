import { describe, expect, it } from 'vitest';
import {
  DIMENSIONS,
  activeColumns,
  buildChartData,
  rowGroupLabel,
} from '@/lib/financialSummary.ts';
import type { FinancialSummaryRow } from '@/queries/financialSummary.ts';

const row = (overrides: Partial<FinancialSummaryRow>): FinancialSummaryRow => ({
  expense: 0, income: 0, net: 0, ...overrides,
});

describe('DIMENSIONS', () => {
  it('exposes the base segments followed by the hierarchy levels', () => {
    const keys = DIMENSIONS.map((d) => d.key);
    // base segments first
    expect(keys.slice(0, 9)).toEqual([
      'FinancialDeptD', 'FinancialDeptE', 'FinancialDeptF', 'FinancialDeptG',
      'Fund', 'Program', 'Activity', 'Project', 'NaturalAccount',
    ]);
    // plus the 18 hierarchy rollup levels (6 each for Fund/Activity/NaturalAccount)
    expect(keys).toContain('FundParentLevel0');
    expect(keys).toContain('ActivityParentLevel5');
    expect(keys).toContain('NaturalAccountParentLevel3');
    expect(keys).toHaveLength(27);
  });
});

describe('activeColumns', () => {
  it('returns only the selected dimensions in catalog order', () => {
    const cols = activeColumns(['Fund', 'FinancialDeptG']);
    expect(cols.map((c) => c.key)).toEqual(['FinancialDeptG', 'Fund']);
  });
});

describe('rowGroupLabel', () => {
  it('joins selected dimension code + name', () => {
    const label = rowGroupLabel(
      row({ fund: '13U00', fundName: 'General Fund' }),
      ['Fund']
    );
    expect(label).toBe('13U00 — General Fund');
  });
});

describe('buildChartData', () => {
  it('produces one bar entry per row with income/expense/net', () => {
    const data = buildChartData(
      [row({ expense: 40, fund: '13U00', fundName: 'General', income: 100, net: 60 })],
      ['Fund']
    );
    expect(data).toEqual([
      { expense: 40, income: 100, label: '13U00 — General', net: 60 },
    ]);
  });
});
