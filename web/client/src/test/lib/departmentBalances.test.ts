import { describe, expect, it } from 'vitest';
import {
  DIMENSIONS,
  MEASURES,
  activeColumns,
  labelKeyOf,
  rowGroupLabel,
  rowLabelSegments,
} from '@/lib/departmentBalances.ts';
import type { DepartmentBalanceRow } from '@/queries/departmentBalances.ts';

const row = (overrides: Partial<DepartmentBalanceRow>): DepartmentBalanceRow => ({
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

describe('rowLabelSegments', () => {
  it('keys a single-dimension row on just that segment', () => {
    const segments = rowLabelSegments(row({ fund: '13U00' }), ['Fund']);
    expect(segments).toEqual({
      account: '', activity: '', dept: '', fund: '13U00', project: '', purpose: '',
    });
  });

  it('keys only the grouped segments even when the row carries others', () => {
    const segments = rowLabelSegments(
      row({ dept: 'ADNO001', fund: '13U00', purpose: '45' }),
      ['Dept', 'Purpose']
    );
    expect(segments).toEqual({
      account: '', activity: '', dept: 'ADNO001', fund: '', project: '', purpose: '45',
    });
  });

  it('is insensitive to dimension selection order', () => {
    const r = row({ dept: 'ADNO001', fund: '13U00' });
    expect(rowLabelSegments(r, ['Fund', 'Dept'])).toEqual(
      rowLabelSegments(r, ['Dept', 'Fund'])
    );
  });
});

describe('labelKeyOf', () => {
  it('round-trips a row to the same key as a stored label', () => {
    const stored = {
      account: '', activity: '', dept: 'ADNO001', fund: '13U00', project: '', purpose: '',
    };
    const fromRow = rowLabelSegments(
      row({ dept: 'ADNO001', fund: '13U00' }),
      ['Dept', 'Fund']
    );
    expect(labelKeyOf(fromRow)).toBe(labelKeyOf(stored));
  });

  it('distinguishes combinations that differ in any segment', () => {
    const a = rowLabelSegments(row({ fund: '13U00' }), ['Fund']);
    const b = rowLabelSegments(row({ dept: '13U00' }), ['Dept']);
    expect(labelKeyOf(a)).not.toBe(labelKeyOf(b));
  });
});
