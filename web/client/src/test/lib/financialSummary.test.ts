import { describe, expect, it } from 'vitest';
import {
  DIMENSIONS,
  MEASURES,
  activeColumns,
  rowGroupLabel,
} from '@/lib/financialSummary.ts';
import type { FinancialSummaryRow } from '@/queries/financialSummary.ts';

const row = (overrides: Partial<FinancialSummaryRow>): FinancialSummaryRow => ({
  assets: 0, endingBalance: 0, expenses: 0, liabilities: 0, netPosition: 0, revenue: 0,
  ...overrides,
});

describe('DIMENSIONS', () => {
  it('exposes the six child-level segments', () => {
    expect(DIMENSIONS.map((d) => d.key)).toEqual([
      'Dept', 'Fund', 'Account', 'Purpose', 'Project', 'Activity',
    ]);
  });
});

describe('MEASURES', () => {
  it('exposes the balance measures in display order', () => {
    expect(MEASURES.map((m) => m.key)).toEqual([
      'assets', 'liabilities', 'netPosition', 'revenue', 'expenses', 'endingBalance',
    ]);
  });
});

describe('activeColumns', () => {
  it('returns only the selected dimensions in catalog order', () => {
    const cols = activeColumns(['Fund', 'Dept']);
    expect(cols.map((c) => c.key)).toEqual(['Dept', 'Fund']);
  });
});

describe('rowGroupLabel', () => {
  it('joins selected dimension code + description', () => {
    const label = rowGroupLabel(
      row({ fund: '13U00', fundDesc: 'General Fund' }),
      ['Fund']
    );
    expect(label).toBe('13U00 — General Fund');
  });

  it('collapses to the code when the description repeats it', () => {
    const label = rowGroupLabel(row({ fund: '13U00', fundDesc: '13U00' }), ['Fund']);
    expect(label).toBe('13U00');
  });
});
