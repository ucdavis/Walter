import { describe, expect, it } from 'vitest';
import { createSalaryExample } from '@/dev/projections/fixture.ts';
import {
  allocationRangeMatches,
  getAllocationEditorSeed,
  replaceAppointmentFunding,
  validateFundingReplacement,
  validateProjectionAllocations,
  type AllocationRange,
  type AllocationShare,
} from '@/lib/projectionAllocations.ts';
import {
  computePiProjection,
  FEE_REMISSION_CATEGORY,
  getProjectionForecastWindow,
  SALARY_CATEGORY,
} from '@/lib/piProjection.ts';
import {
  validateProjectionAppointments,
  type AppointmentOperationResult,
} from '@/lib/projectionAppointments.ts';
import { createProjectionSession } from '@/lib/projectionWorkspace.ts';
import type {
  ProjectionDraft,
  ProjectionFundingAllocation,
} from '@/queries/projections.ts';

function allocation(
  fundingSourceId: number | null,
  percent: number,
  startDate: string | null = null,
  endDate: string | null = null
): ProjectionFundingAllocation {
  return { endDate, fundingSourceId, percent, startDate };
}

function initial(allocations = [allocation(1, 1, '2026-01-01', '2026-12-31')]) {
  const plan = createSalaryExample();
  plan.content.appointments[0].allocations = allocations;
  plan.content.appointments[0].endDate = '2026-12-31';
  for (const source of plan.content.fundingSources) {
    source.endDate = '2026-12-31';
  }
  return createProjectionSession(plan);
}

function applied<T extends ProjectionDraft>(
  result: AppointmentOperationResult<T>
) {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.session;
}

const whole: AllocationRange = { endDate: null, startDate: null };
const summer: AllocationRange = {
  endDate: '2026-09-30',
  startDate: '2026-07-01',
};
const shareB: AllocationShare[] = [{ fundingSourceId: 2, percent: 1 }];

describe('replacing an appointment funding period', () => {
  it('switches a middle period while preserving both sides and every other plan input', () => {
    const session = initial();
    const appointment = session.draft.content.appointments[0];
    const updated = applied(
      replaceAppointmentFunding(session, 101, summer, shareB)
    );
    expect(updated.draft.content.appointments[0]).toEqual({
      ...appointment,
      allocations: [
        allocation(1, 1, '2026-01-01', '2026-06-30'),
        allocation(1, 1, '2026-10-01', '2026-12-31'),
        allocation(2, 1, '2026-07-01', '2026-09-30'),
      ],
    });
    expect(updated.draft.content.fundingSources).toBe(
      session.draft.content.fundingSources
    );
    expect(updated.draft.seededAt).toBe(session.draft.seededAt);
    expect(updated.baseline).toBe(session.baseline);
    expect(updated.revision).toBe(1);
    expect(appointment.allocations).toEqual([
      allocation(1, 1, '2026-01-01', '2026-12-31'),
    ]);
  });

  it('splits at exact inclusive day boundaries and preserves unrelated allocation objects', () => {
    const unrelated = allocation(null, 0.2, '2027-01-01', null);
    const session = initial([allocation(1, 1), unrelated]);
    const updated = applied(
      replaceAppointmentFunding(
        session,
        101,
        {
          endDate: '2026-03-16',
          startDate: '2026-03-15',
        },
        shareB
      )
    );
    expect(updated.draft.content.appointments[0].allocations).toEqual([
      allocation(1, 1, null, '2026-03-14'),
      allocation(1, 1, '2026-03-17', null),
      unrelated,
      allocation(2, 1, '2026-03-15', '2026-03-16'),
    ]);
    expect(updated.draft.content.appointments[0].allocations[2]).toBe(
      unrelated
    );
    expect(
      computePiProjection(updated.draft).rows.find(
        (row) =>
          row.fundingSourceId === 2 &&
          row.month === '2026-03' &&
          row.expenditureCategory === SALARY_CATEGORY
      )?.projectedAmount
    ).toBeCloseTo((5000 * 2) / 31);
  });

  it.each([
    ['2028-02-29', '2028-02-28', '2028-03-01'],
    ['2026-12-31', '2026-12-30', '2027-01-01'],
  ])(
    'preserves the days adjacent to %s when clearing a single day',
    (selected, previous, next) => {
      const updated = applied(
        replaceAppointmentFunding(
          initial([allocation(null, 1)]),
          101,
          { endDate: selected, startDate: selected },
          []
        )
      );
      expect(updated.draft.content.appointments[0].allocations).toEqual([
        allocation(null, 1, null, previous),
        allocation(null, 1, next, null),
      ]);
    }
  );

  it('supports an open end and an entire-appointment replacement without artificial date limits', () => {
    const session = initial([allocation(1, 1)]);
    const throughEnd = applied(
      replaceAppointmentFunding(
        session,
        101,
        { endDate: null, startDate: '2026-07-01' },
        shareB
      )
    );
    expect(throughEnd.draft.content.appointments[0].allocations).toEqual([
      allocation(1, 1, null, '2026-06-30'),
      allocation(2, 1, '2026-07-01', null),
    ]);
    const entire = applied(
      replaceAppointmentFunding(throughEnd, 101, whole, [
        { fundingSourceId: null, percent: 0.5 },
      ])
    );
    expect(entire.draft.content.appointments[0].allocations).toEqual([
      allocation(null, 0.5),
    ]);
  });

  it.each(['0001-01-01', '9999-12-31'])(
    'does not create invalid dates outside DateOnly at %s',
    (selected) => {
      const updated = applied(
        replaceAppointmentFunding(
          initial([allocation(1, 1)]),
          101,
          { endDate: selected, startDate: selected },
          []
        )
      );
      expect(updated.draft.content.appointments[0].allocations).toHaveLength(1);
      expect(validateProjectionAllocations(updated.draft)).toBeNull();
    }
  );

  it('leaves a homogeneous schedule intact on unchanged Apply, including duplicate entries and precision', () => {
    const session = initial([
      allocation(1, 0.333_333_333),
      allocation(1, 0.333_333_333),
      allocation(null, 0.2),
    ]);
    const unchanged = applied(
      replaceAppointmentFunding(session, 101, summer, [
        { fundingSourceId: null, percent: 0.2 },
        { fundingSourceId: 1, percent: 0.333_333_333 },
        { fundingSourceId: 1, percent: 0.333_333_333 },
      ])
    );
    expect(unchanged).toBe(session);
    expect(
      allocationRangeMatches(session.draft.content.appointments[0], whole, [
        { fundingSourceId: 1, percent: 0.666_666_666 },
        { fundingSourceId: null, percent: 0.2 },
      ])
    ).toBe(false);
  });

  it('acknowledges unmatched imported funding without fragmenting an unchanged schedule', () => {
    const session = initial();
    session.draft.content.appointments[0].hasUnmatchedFunding = true;
    const updated = applied(
      replaceAppointmentFunding(session, 101, summer, [
        { fundingSourceId: 1, percent: 1 },
      ])
    );
    expect(updated.draft.content.appointments[0].hasUnmatchedFunding).toBe(
      false
    );
    expect(updated.draft.content.appointments[0].allocations).toBe(
      session.draft.content.appointments[0].allocations
    );
    expect(updated.revision).toBe(1);
  });

  it('allows zero shares, overlapping repeated sources, and outside funding without rescaling', () => {
    const updated = applied(
      replaceAppointmentFunding(initial(), 101, summer, [
        { fundingSourceId: 1, percent: 1 },
        { fundingSourceId: 1, percent: 1 },
        { fundingSourceId: 2, percent: 0 },
        { fundingSourceId: null, percent: 0.5 },
      ])
    );
    expect(
      updated.draft.content.appointments[0].allocations
        .slice(-4)
        .map(({ percent }) => percent)
    ).toEqual([1, 1, 0, 0.5]);
    expect(validateProjectionAllocations(updated.draft)).toBeNull();
  });

  it('can repair invalid captured percentages inside the range while retaining invalid inputs outside for review', () => {
    const session = initial([
      allocation(1, 2, '2026-01-01', '2026-06-30'),
      allocation(2, -0.5, '2026-07-01', null),
    ]);
    const partial = applied(
      replaceAppointmentFunding(
        session,
        101,
        { endDate: '2026-06-30', startDate: '2026-01-01' },
        shareB
      )
    );
    expect(validateProjectionAppointments(partial.draft)).toContain(
      'allocation'
    );
    const repaired = applied(
      replaceAppointmentFunding(partial, 101, whole, shareB)
    );
    expect(validateProjectionAppointments(repaired.draft)).toBeNull();
  });

  it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid individual share %s without changing the session',
    (percent) => {
      const session = initial();
      expect(
        replaceAppointmentFunding(session, 101, summer, [
          { fundingSourceId: 1, percent },
        ]).ok
      ).toBe(false);
      expect(session.revision).toBe(0);
    }
  );

  it.each([
    { endDate: '2026-01-31', startDate: '2026-02-01' },
    { endDate: null, startDate: '2026-02-29' },
    { endDate: null, startDate: '0000-01-01' },
    { endDate: '2026-03', startDate: null },
  ])('rejects invalid period $startDate to $endDate', (range) => {
    expect(
      validateFundingReplacement(initial().draft, 101, range, shareB)
    ).not.toBeNull();
  });

  it('rejects stale source and appointment targets', () => {
    expect(
      validateFundingReplacement(initial().draft, 999, summer, shareB)
    ).toContain('appointment');
    expect(
      validateFundingReplacement(initial().draft, 101, summer, [
        { fundingSourceId: 999, percent: 1 },
      ])
    ).toContain('source');
  });
});

describe('allocation editor seed', () => {
  it('loads a homogeneous month as exact dates without combining duplicate sources', () => {
    const appointment = initial([allocation(1, 0.5), allocation(1, 0.5)]).draft
      .content.appointments[0];
    expect(getAllocationEditorSeed(appointment, '2026-02')).toEqual({
      mixed: false,
      range: { endDate: '2026-02-28', startDate: '2026-02-01' },
      shares: [
        { fundingSourceId: 1, percent: 0.5 },
        { fundingSourceId: 1, percent: 0.5 },
      ],
    });
  });

  it('selects only the first constant segment of a mixed month, including an initial funding gap', () => {
    const appointment = initial([
      allocation(1, 1, '2026-03-10', '2026-03-15'),
      allocation(2, 1, '2026-03-16', null),
    ]).draft.content.appointments[0];
    expect(getAllocationEditorSeed(appointment, '2026-03')).toEqual({
      mixed: true,
      range: { endDate: '2026-03-09', startDate: '2026-03-01' },
      shares: [],
    });
    appointment.startDate = '2026-03-10';
    expect(getAllocationEditorSeed(appointment, '2026-03')).toEqual({
      mixed: true,
      range: { endDate: '2026-03-15', startDate: '2026-03-10' },
      shares: [{ fundingSourceId: 1, percent: 1 }],
    });
  });

  it('clips the seed to appointment dates and handles leap months and the DateOnly upper bound', () => {
    const appointment = initial([allocation(1, 1)]).draft.content
      .appointments[0];
    appointment.startDate = '2028-02-10';
    appointment.endDate = null;
    expect(getAllocationEditorSeed(appointment, '2028-02').range).toEqual({
      endDate: '2028-02-29',
      startDate: '2028-02-10',
    });
    expect(getAllocationEditorSeed(appointment, '9999-12').range.endDate).toBe(
      '9999-12-31'
    );
  });
});

describe('dated allocation coverage', () => {
  it('retains four-digit years and correct month lengths at the DateOnly lower bound', () => {
    const plan = initial([allocation(1, 1)]).draft;
    plan.seededAt = '0001-01-01T00:00:00Z';
    plan.content.appointments[0].startDate = '0001-01-01';
    plan.content.appointments[0].endDate = '0001-02-28';
    for (const source of plan.content.fundingSources) {
      source.capturedAt = plan.seededAt;
      source.startDate = '0001-01-01';
      source.endDate = '0001-02-28';
      source.actuals = [];
    }
    const result = computePiProjection(plan);
    expect(result.forecastWindow).toEqual({
      endMonth: '0001-12',
      startMonth: '0001-01',
    });
    expect(result.appointmentFunding).toHaveLength(2);
    expect(
      result.appointmentFunding.every(
        ({ fundedPercent }) => fundedPercent === 1
      )
    ).toBe(true);
    expect(
      result.rows.find(
        (row) =>
          row.month === '0001-02' &&
          row.fundingSourceId === 1 &&
          row.expenditureCategory === SALARY_CATEGORY
      )?.projectedAmount
    ).toBe(5000);
  });
  it('finds both a gap and an overlap even when their monthly average is 100%', () => {
    const plan = initial([
      allocation(1, 1, '2026-04-16', '2026-04-30'),
      allocation(2, 1, '2026-04-16', '2026-04-30'),
    ]).draft;
    const april = computePiProjection(plan).appointmentFunding.find(
      ({ month }) => month === '2026-04'
    );
    expect(april).toEqual({
      appointmentId: 101,
      fundedPercent: 1,
      hasGap: true,
      hasOverlap: true,
      month: '2026-04',
      shares: [
        { fundingSourceId: 1, percent: 0.5 },
        { fundingSourceId: 2, percent: 0.5 },
      ],
    });
  });

  it('uses source and appointment bounds and counts outside funding without charging a plan source', () => {
    const plan = initial([allocation(1, 0.5), allocation(null, 0.5)]).draft;
    plan.content.appointments[0].startDate = '2026-04-10';
    plan.content.appointments[0].endDate = '2026-04-20';
    plan.content.fundingSources[0].endDate = '2026-04-15';
    const result = computePiProjection(plan);
    expect(result.appointmentFunding).toHaveLength(1);
    expect(result.appointmentFunding[0]).toMatchObject({
      fundedPercent: 0.5 + (0.5 * 6) / 11,
      hasGap: true,
      hasOverlap: false,
    });
    expect(
      result.rows.find(
        (row) =>
          row.month === '2026-04' &&
          row.fundingSourceId === 1 &&
          row.expenditureCategory === SALARY_CATEGORY
      )?.projectedAmount
    ).toBe((5000 * 0.5 * 6) / 30);
  });

  it('keeps zero-FTE fees and coverage while retaining captured actuals', () => {
    const session = initial();
    session.draft.content.appointments[0].fte = 0;
    session.draft.content.appointments[0].feeRemissionMonthly = 1500;
    const updated = applied(
      replaceAppointmentFunding(session, 101, whole, [
        { fundingSourceId: 1, percent: 0.5 },
        { fundingSourceId: null, percent: 0.5 },
      ])
    );
    const result = computePiProjection(updated.draft);
    expect(
      result.appointmentFunding.every(
        ({ hasGap, hasOverlap }) => !hasGap && !hasOverlap
      )
    ).toBe(true);
    expect(
      result.rows.find(
        (row) =>
          row.month === '2026-02' &&
          row.fundingSourceId === 1 &&
          row.expenditureCategory === FEE_REMISSION_CATEGORY
      )?.projectedAmount
    ).toBe(750);
    expect(updated.draft.content.fundingSources).toBe(
      session.draft.content.fundingSources
    );
    expect(updated.draft.content.fundingSources[0].actuals[0].amount).toBe(
      2500
    );
  });

  it('keeps capture as a balance date rather than a new start boundary for coverage', () => {
    const plan = initial([allocation(1, 1)]).draft;
    plan.content.fundingSources[0].capturedAt = '2026-05-15T00:00:00Z';
    const result = computePiProjection(plan);
    expect(
      result.appointmentFunding.find(({ month }) => month === '2026-01')
    ).toMatchObject({ fundedPercent: 1, hasGap: false });
    expect(
      result.rows.some(
        ({ fundingSourceId, month }) =>
          fundingSourceId === 1 && month < '2026-05'
      )
    ).toBe(false);
  });

  it('exposes the fixed plan horizon without pretending to check a later appointment', () => {
    const plan = initial().draft;
    plan.content.fundingSources[0].endDate = null;
    plan.content.appointments[0].startDate = '2028-01-01';
    plan.content.appointments[0].endDate = null;
    expect(getProjectionForecastWindow(plan)).toEqual({
      endMonth: '2026-12',
      startMonth: '2026-01',
    });
    expect(computePiProjection(plan).appointmentFunding).toEqual([]);
    plan.content.fundingSources = [];
    expect(getProjectionForecastWindow(plan)).toEqual({
      endMonth: '2026-12',
      startMonth: '2026-01',
    });
  });
});
