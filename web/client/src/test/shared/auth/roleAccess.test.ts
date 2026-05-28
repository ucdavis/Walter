import { describe, expect, it } from 'vitest';
import { canViewProjectDiscrepancy } from '@/shared/auth/roleAccess.ts';

describe('canViewProjectDiscrepancy', () => {
  it('allows the PM listed on the project to see it', () => {
    expect(canViewProjectDiscrepancy([], '2000', '2000')).toBe(true);
  });

  it('hides it from a PI viewing their own project', () => {
    expect(canViewProjectDiscrepancy([], '2000', '1000')).toBe(false);
  });

  it('allows a FinancialViewer regardless of who the PM is', () => {
    expect(
      canViewProjectDiscrepancy(['FinancialViewer'], '2000', '3000')
    ).toBe(true);
  });

  it('allows an Admin regardless of who the PM is', () => {
    expect(canViewProjectDiscrepancy(['Admin'], '2000', '3000')).toBe(true);
  });

  it('hides it from a Manager (not in the rule)', () => {
    expect(canViewProjectDiscrepancy(['Manager'], '2000', '3000')).toBe(false);
  });

  it('hides it when the project has no PM and viewer is not FV/Admin', () => {
    expect(canViewProjectDiscrepancy([], null, '1000')).toBe(false);
  });
});
