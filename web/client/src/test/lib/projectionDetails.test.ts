import { describe, expect, it } from 'vitest';
import { createSalaryExample } from '@/test/fixtures/projections.ts';
import {
  computeExpenseForecast,
  computePiProjection,
  getProjectionForecastWindow,
  getSourceForecastWindow,
  SALARY_CATEGORY,
  SUPPLIES_CATEGORY,
} from '@/lib/piProjection.ts';
import {
  DEFAULT_FORECAST_MONTHS,
  editPlanDetails,
  validatePlanDetails,
  type PlanDetailsOperationResult,
} from '@/lib/projectionDetails.ts';
import {
  acknowledgeProjectionSave,
  createProjectionSession,
  isProjectionDirty,
} from '@/lib/projectionWorkspace.ts';
import type { ProjectionDraft } from '@/queries/projections.ts';
function applied<T extends ProjectionDraft>(
  result: PlanDetailsOperationResult<T>
) {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.session;
}
function plan() {
  const draft = createSalaryExample();
  draft.seededAt = '2026-01-16T12:30:00.1234567Z';
  draft.content.appointments = [];
  draft.content.fundingSources = [
    {
      ...draft.content.fundingSources[0],
      actuals: [],
      budgets: [
        {
          budget: 10_000,
          committed: 0,
          expenditureCategory: SUPPLIES_CATEGORY,
          spentToDate: 0,
        },
      ],
      capturedAt: draft.seededAt,
      endDate: null,
      runRates: [
        {
          expenditureCategory: SUPPLIES_CATEGORY,
          historyMonths: 3,
          monthlyAmount: 310,
        },
      ],
      startDate: '2026-01-01',
    },
  ];
  return draft;
}
describe('plan details operations', () => {
  it('applies metadata together without changing captured inputs and treats blank notes or unchanged inputs as no-ops', () => {
    const original = createProjectionSession(plan());
    expect(
      applied(
        editPlanDetails(original, {
          ...original.draft.content,
          name: original.draft.name,
          notes: '   ',
        })
      )
    ).toBe(original);
    const updated = applied(
      editPlanDetails(original, {
        forecastMonths: 18,
        name: '  Alternate plan  ',
        notes: 'Assumes renewal.\n  Preserve this indentation.',
      })
    );
    expect(updated.draft).toMatchObject({
      content: {
        forecastMonths: 18,
        notes: 'Assumes renewal.\n  Preserve this indentation.',
      },
      name: 'Alternate plan',
    });
    expect(updated.draft.content.fundingSources).toBe(
      original.draft.content.fundingSources
    );
    expect(updated.draft.content.appointments).toBe(
      original.draft.content.appointments
    );
    expect(updated.draft.seededAt).toBe(original.draft.seededAt);
    expect(updated.revision).toBe(1);
    expect(isProjectionDirty(updated)).toBe(true);
    expect(
      applied(
        editPlanDetails(updated, {
          ...updated.draft.content,
          name: updated.draft.name,
        })
      )
    ).toBe(updated);
    expect(
      isProjectionDirty(
        applied(
          editPlanDetails(updated, {
            ...original.draft.content,
            name: original.draft.name,
          })
        )
      )
    ).toBe(false);
  });
  it.each([
    { forecastMonths: 13 },
    { forecastMonths: 0 },
    { name: '   ' },
    { name: 'x'.repeat(201) },
    { notes: 'x'.repeat(2001) },
  ])('rejects invalid details without applying them: %s', (invalid) => {
    const current = createProjectionSession(plan());
    expect(
      editPlanDetails(current, {
        ...current.draft.content,
        name: current.draft.name,
        ...invalid,
      }).ok
    ).toBe(false);
    expect(current.revision).toBe(0);
  });
  it('accepts both durations and exact field limits while rejecting unrepresentable forecast ends', () => {
    const inputs = {
      forecastMonths: 18,
      name: 'x'.repeat(200),
      notes: 'x'.repeat(2000),
    };
    expect(validatePlanDetails(inputs, '2026-01-01T00:00:00Z')).toBeNull();
    expect(
      validatePlanDetails(
        { ...inputs, forecastMonths: DEFAULT_FORECAST_MONTHS, notes: null },
        '9999-01-01T00:00:00Z'
      )
    ).toBeNull();
    expect(validatePlanDetails(inputs, '9998-07-01T00:00:00Z')).toBeNull();
    expect(validatePlanDetails(inputs, '9999-01-01T00:00:00Z')).not.toBeNull();
    expect(
      validatePlanDetails(
        { ...inputs, forecastMonths: 12 },
        '9999-02-01T00:00:00Z'
      )
    ).not.toBeNull();
  });
  it('acknowledges a submitted version while retaining newer name, notes, and duration', () => {
    const original = createProjectionSession(plan());
    const submitted = applied(
      editPlanDetails(original, {
        ...original.draft.content,
        name: original.draft.name,
        notes: 'Submitted note',
      })
    );
    const newer = applied(
      editPlanDetails(submitted, {
        forecastMonths: 18,
        name: 'Newer name',
        notes: 'Newer note',
      })
    );
    const saved = {
      ...submitted.draft,
      updatedAt: '2026-02-02T00:00:00.7654321Z',
    };
    const acknowledged = acknowledgeProjectionSave(newer, submitted, saved);
    expect(acknowledged.baseline).toBe(saved);
    expect(acknowledged.draft.content).toBe(newer.draft.content);
    expect(acknowledged.draft).toMatchObject({
      content: { forecastMonths: 18, notes: 'Newer note' },
      name: 'Newer name',
      seededAt: original.draft.seededAt,
      updatedAt: saved.updatedAt,
    });
    expect(isProjectionDirty(acknowledged)).toBe(true);
    const clean = acknowledgeProjectionSave(submitted, submitted, saved);
    expect(clean.draft).toBe(saved);
    expect(isProjectionDirty(clean)).toBe(false);
  });
});
describe('fixed plan forecast periods', () => {
  it('includes the snapshot month in exactly 12 or 18 months, independently of sources', () => {
    const draft = plan();
    draft.seededAt = '2026-11-21T23:59:59Z';
    expect(getProjectionForecastWindow(draft)).toEqual({
      endMonth: '2027-10',
      startMonth: '2026-11',
    });
    draft.content.forecastMonths = 18;
    expect(getProjectionForecastWindow(draft)).toEqual({
      endMonth: '2028-04',
      startMonth: '2026-11',
    });
    draft.content.fundingSources = [];
    expect(getProjectionForecastWindow(draft)).toEqual({
      endMonth: '2028-04',
      startMonth: '2026-11',
    });
  });
  it('extends open-source costs when duration changes and keeps the snapshot and schedules unchanged', () => {
    const original = createProjectionSession(plan());
    const before = computePiProjection(original.draft);
    const updated = applied(
      editPlanDetails(original, {
        ...original.draft.content,
        forecastMonths: 18,
        name: original.draft.name,
      })
    );
    const after = computePiProjection(updated.draft);
    expect(before.rows).toHaveLength(12);
    expect(after.rows).toHaveLength(18);
    expect(after.rows.slice(0, 12)).toEqual(before.rows);
    expect(after.rows.at(-1)).toMatchObject({
      month: '2027-06',
      projectedAmount: 310,
    });
    expect(after.rows.at(-1)!.remaining).toBe(
      before.rows.at(-1)!.remaining - 6 * 310
    );
    expect(updated.draft.content.fundingSources).toBe(
      original.draft.content.fundingSources
    );
  });
  it('carries ended-source balances to the common end without new costs or newly applying post-end actual rows', () => {
    const draft = plan();
    draft.content.fundingSources[0].endDate = '2026-03-10';
    draft.content.fundingSources[0].actuals = [
      {
        amount: 999,
        expenditureCategory: SUPPLIES_CATEGORY,
        month: '2026-04-01',
      },
    ];
    const result = computePiProjection(draft);
    expect(result.rows).toHaveLength(12);
    expect(result.rows[2]).toMatchObject({
      month: '2026-03',
      projectedAmount: 100,
      remaining: 9440,
    });
    expect(
      result.rows
        .slice(3)
        .every(
          (row) =>
            row.actualAmount === 0 &&
            row.projectedAmount === 0 &&
            row.remaining === 9440
        )
    ).toBe(true);
    expect(result.rows.at(-1)?.month).toBe('2026-12');
  });
  it('keeps a later source at its capture month without extending the plan or other source forecasts', () => {
    const draft = plan();
    const before = computePiProjection(draft);
    draft.content.fundingSources.push({
      ...structuredClone(draft.content.fundingSources[0]),
      capturedAt: '2026-11-16T00:00:00Z',
      id: 2,
    });
    const after = computePiProjection(draft);
    expect(after.forecastWindow).toEqual(before.forecastWindow);
    expect(after.rows.filter((row) => row.fundingSourceId === 1)).toEqual(
      before.rows
    );
    expect(after.rows.filter((row) => row.fundingSourceId === 2)).toEqual([
      expect.objectContaining({
        month: '2026-11',
        projectedAmount: (310 * 14) / 30,
      }),
      expect.objectContaining({ month: '2026-12', projectedAmount: 310 }),
    ]);
  });
  it.each(['capture', 'availability'] as const)(
    'keeps sources with future %s outside financial rows until their period becomes visible',
    (future) => {
      const draft = plan();
      const source = draft.content.fundingSources[0];
      if (future === 'capture') {
        source.capturedAt = '2027-02-15T00:00:00Z';
      } else {
        source.startDate = '2027-02-15';
      }
      const captured = structuredClone(source);
      expect(
        getSourceForecastWindow(source, getProjectionForecastWindow(draft))
          .isBeyondForecast
      ).toBe(true);
      expect(computePiProjection(draft).rows).toEqual([]);
      draft.content.forecastMonths = 18;
      const rows = computePiProjection(draft).rows;
      expect(rows.some((row) => row.projectedAmount > 0)).toBe(true);
      expect(rows.at(-1)?.month).toBe('2027-06');
      expect(source).toEqual(captured);
    }
  );
  it('checks appointment funding by availability even when source capture is outside the plan period', () => {
    const draft = plan();
    const appointment = createSalaryExample().content.appointments[0];
    appointment.endDate = null;
    appointment.allocations = [
      { endDate: null, fundingSourceId: 1, percent: 1, startDate: null },
    ];
    draft.content.appointments = [appointment];
    draft.content.fundingSources[0].capturedAt = '2027-02-15T00:00:00Z';
    const result = computePiProjection(draft);
    expect(result.rows).toEqual([]);
    expect(result.appointmentFunding).toHaveLength(12);
    expect(
      result.appointmentFunding.every(
        (month) => month.fundedPercent === 1 && !month.hasGap
      )
    ).toBe(true);
  });
  it('retains stored expense dates and activates later costs when the duration includes them', () => {
    const draft = plan();
    const source = draft.content.fundingSources[0];
    source.runRates = [];
    source.expenses = [
      {
        amount: -1000,
        description: 'Planned credit',
        endMonth: null,
        expenditureCategory: SUPPLIES_CATEGORY,
        id: 1,
        kind: 'OneTime',
        startMonth: '2027-03-01',
      },
    ];
    const expense = source.expenses[0];
    expect(
      computeExpenseForecast(
        source,
        expense,
        getProjectionForecastWindow(draft)
      )
    ).toEqual({ hasEligibleDates: false, months: [], total: 0 });
    draft.content.forecastMonths = 18;
    const contribution = computeExpenseForecast(
      source,
      expense,
      getProjectionForecastWindow(draft)
    );
    expect(contribution).toEqual({
      hasEligibleDates: true,
      months: [{ amount: -1000, month: '2027-03' }],
      total: -1000,
    });
    expect(
      computePiProjection(draft).rows.reduce(
        (sum, row) => sum + row.projectedAmount,
        0
      )
    ).toBe(contribution.total);
    expect(source.expenses[0]).toBe(expense);
  });
  it('preserves post-end capture-month salary credit netting and then carries its balance', () => {
    const draft = plan();
    const source = draft.content.fundingSources[0];
    source.endDate = '2025-12-31';
    source.runRates = [];
    source.budgets = [
      {
        budget: 1000,
        committed: 0,
        expenditureCategory: SALARY_CATEGORY,
        spentToDate: -100,
      },
    ];
    source.actuals = [
      {
        amount: -100,
        expenditureCategory: SALARY_CATEGORY,
        month: '2026-01-01',
      },
    ];
    const result = computePiProjection(draft);
    expect(result.rows[0]).toMatchObject({
      actualAmount: -100,
      month: '2026-01',
      projectedAmount: 100,
      remaining: 1000,
    });
    expect(
      result.rows
        .slice(1)
        .every((row) => row.projectedAmount === 0 && row.remaining === 1000)
    ).toBe(true);
  });
});
