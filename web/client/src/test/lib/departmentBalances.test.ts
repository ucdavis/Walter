import { describe, expect, it } from 'vitest';
import {
  DIMENSIONS,
  MEASURES,
  activeColumns,
  activeMeasures,
  joinCodeList,
  labelKeyOf,
  parseCodeList,
  parseFieldList,
  rowGroupLabel,
  rowLabelSegments,
} from '@/lib/departmentBalances.ts';
import type { DepartmentBalanceRow } from '@/queries/departmentBalances.ts';

const row = (overrides: Partial<DepartmentBalanceRow>): DepartmentBalanceRow => ({
  assets: 0, endingBalance: 0, expenses: 0, liabilities: 0, netPosition: 0, revenue: 0,
  ...overrides,
});

describe('DIMENSIONS', () => {
  it('exposes the eight child-level segments', () => {
    expect(DIMENSIONS.map((d) => d.key)).toEqual([
      'Entity', 'Fund', 'Dept', 'Account', 'Purpose', 'Program', 'Project', 'Activity',
    ]);
  });
});

describe('MEASURES', () => {
  it('exposes only the displayed measures in display order', () => {
    expect(MEASURES.map((m) => m.key)).toEqual([
      'netPosition', 'revenue', 'expenses', 'endingBalance',
    ]);
  });
});

describe('activeMeasures', () => {
  it('prepends assets and liabilities when the balance-sheet toggle is on', () => {
    expect(activeMeasures(true).map((m) => m.key)).toEqual([
      'assets', 'liabilities', 'netPosition', 'revenue', 'expenses', 'endingBalance',
    ]);
  });

  it('returns only the always-on measures when the toggle is off', () => {
    expect(activeMeasures(false)).toEqual(MEASURES);
  });
});

describe('activeColumns', () => {
  it('returns only the selected dimensions in catalog order', () => {
    const cols = activeColumns(['Dept', 'Fund']);
    expect(cols.map((c) => c.key)).toEqual(['Fund', 'Dept']);
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
  it('ignores segments outside the label key (entity, program)', () => {
    const segments = rowLabelSegments(
      row({ entity: '3110', fund: '13U00', program: '150' }),
      ['Entity', 'Fund', 'Program']
    );
    expect(segments).toEqual({
      account: '', activity: '', dept: '', fund: '13U00', project: '', purpose: '',
    });
  });


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

describe('parseCodeList', () => {
  it('splits a comma-joined string into codes', () => {
    expect(parseCodeList('13U00,1100')).toEqual(['13U00', '1100']);
  });

  it('trims whitespace and drops empty entries', () => {
    expect(parseCodeList(' 13U00 , ,1100,')).toEqual(['13U00', '1100']);
  });

  it('drops duplicate codes', () => {
    expect(parseCodeList('1100,1100,1200')).toEqual(['1100', '1200']);
  });

  it('returns an empty list for missing or non-scalar values', () => {
    expect(parseCodeList(undefined)).toEqual([]);
    expect(parseCodeList(null)).toEqual([]);
    expect(parseCodeList({ funds: '1100' })).toEqual([]);
  });

  it('accepts a numeric value the URL parser produced for an all-digit code', () => {
    expect(parseCodeList(1100)).toEqual(['1100']);
  });

  it('accepts up to 500 distinct codes', () => {
    const list = Array.from({ length: 500 }, (_, i) => `C${i}`).join(',');
    expect(parseCodeList(list)).toHaveLength(500);
  });

  it('throws past 500 distinct codes rather than silently truncating', () => {
    const huge = Array.from({ length: 501 }, (_, i) => `C${i}`).join(',');
    expect(() => parseCodeList(huge)).toThrow('Too many codes');
  });
});

describe('joinCodeList', () => {
  it('joins codes with commas', () => {
    expect(joinCodeList(['13U00', '1100'])).toBe('13U00,1100');
  });

  it('returns undefined for an empty list so the param drops from the URL', () => {
    expect(joinCodeList([])).toBeUndefined();
  });

  it('round-trips through parseCodeList', () => {
    expect(parseCodeList(joinCodeList(['A', 'B']))).toEqual(['A', 'B']);
  });
});

describe('parseFieldList', () => {
  it('keeps known dimension keys', () => {
    expect(parseFieldList('Fund,Account')).toEqual(['Fund', 'Account']);
  });

  it('drops unknown keys', () => {
    expect(parseFieldList('Fund,Bogus')).toEqual(['Fund']);
  });

  it('canonicalizes case for hand-edited links', () => {
    expect(parseFieldList('fund,ACCOUNT')).toEqual(['Fund', 'Account']);
  });
});
