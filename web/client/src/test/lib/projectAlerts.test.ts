import { describe, expect, it } from 'vitest';
import { getAlertsForProject } from '@/lib/projectAlerts.ts';
import type { ProjectSummary } from '@/lib/projectSummary.ts';

const createSummary = (
  overrides: Partial<ProjectSummary> = {}
): ProjectSummary => ({
  awardCloseDate: null,
  awardEndDate: '2030-12-31',
  awardNumber: null,
  awardPi: null,
  awardStartDate: '2020-01-01',
  awardStatus: null,
  awardType: null,
  billingCycle: null,
  categories: [],
  contractAdministrator: null,
  copi: null,
  costShareRequiredBySponsor: null,
  displayName: 'TEST-001: Test Project',
  grantAdministrator: null,
  internalFundedProject: null,
  isInternal: false,
  pa: null,
  pi: null,
  pm: null,
  pmEmployeeId: null,
  postReportingPeriod: null,
  primarySponsorName: null,
  projectBurdenCostRate: null,
  projectBurdenScheduleBase: null,
  projectFund: null,
  projectNumber: 'TEST-001',
  projectStatusCode: 'ACTIVE',
  sponsorAwardNumber: null,
  totals: { balance: 5000, budget: 10000, encumbrance: 0, expense: 5000 },
  ...overrides,
});

describe('getAlertsForProject', () => {
  it('returns error alert for negative balance', () => {
    const summary = createSummary({
      totals: { balance: -500, budget: 10000, encumbrance: 0, expense: 10500 },
    });
    const alerts = getAlertsForProject(summary);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('negative-balance');
    expect(alerts[0].severity).toBe('error');
  });

  it('returns warning alert for low budget (<10%)', () => {
    const summary = createSummary({
      totals: { balance: 900, budget: 10000, encumbrance: 0, expense: 9100 },
    });
    const alerts = getAlertsForProject(summary);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('low-budget');
    expect(alerts[0].severity).toBe('warning');
  });

  it('returns warning alert when project ends within 3 months', () => {
    const twoMonthsFromNow = new Date();
    twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);
    const summary = createSummary({
      awardEndDate: twoMonthsFromNow.toISOString(),
    });
    const alerts = getAlertsForProject(summary);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('ending-soon');
    expect(alerts[0].severity).toBe('warning');
  });

  it('returns no alerts for healthy project', () => {
    const summary = createSummary();
    const alerts = getAlertsForProject(summary);

    expect(alerts).toHaveLength(0);
  });

  it('uses custom prefix in message', () => {
    const summary = createSummary({
      totals: { balance: -500, budget: 10000, encumbrance: 0, expense: 10500 },
    });
    const alerts = getAlertsForProject(summary, 'My Project ');

    expect(alerts[0].message).toMatch(/^My Project /);
  });

  describe('edge cases', () => {
    it('handles zero budget without error', () => {
      const summary = createSummary({
        totals: { balance: 0, budget: 0, encumbrance: 0, expense: 0 },
      });
      const alerts = getAlertsForProject(summary);

      expect(alerts).toHaveLength(0);
    });

    it('skips ending-soon check when no end date', () => {
      const summary = createSummary({ awardEndDate: null });
      const alerts = getAlertsForProject(summary);

      expect(alerts).toHaveLength(0);
    });

    it('does not show ending-soon for past end date', () => {
      const summary = createSummary({ awardEndDate: '2020-01-01' });
      const alerts = getAlertsForProject(summary);

      expect(alerts.find((a) => a.type === 'ending-soon')).toBeUndefined();
    });
  });
});
