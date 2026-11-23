import { describe, expect, it } from 'vitest';
import { buildPlanChanges } from '@/lib/projectionChanges.ts';
import {
  compareAllocationSchedules,
  replaceAppointmentFunding,
} from '@/lib/projectionAllocations.ts';
import { createProjectionSession } from '@/lib/projectionWorkspace.ts';
import {
  mergeSetupEdits,
  selectComparisonScope,
  selectedSetupSession,
} from '@/lib/projectionSetup.ts';
import {
  addProjectionAppointment,
  removeProjectionAppointment,
} from '@/lib/projectionAppointments.ts';
import {
  addImportedSources,
  addPlannedSource,
  removeProjectionSource,
} from '@/lib/projectionSources.ts';
import { createSalaryExample } from '@/test/fixtures/projections.ts';

function applied<T>(
  result: { ok: true; session: T } | { error: string; ok: false }
): T {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.session;
}

const row = (
  id: number | null,
  percent: number,
  startDate: string | null,
  endDate: string | null
) => ({ endDate, fundingSourceId: id, percent, startDate });

describe('plan changes', () => {
  it('compares only final staffing and source terms and clears reverted edits', () => {
    const plan = createSalaryExample();
    const appointment = plan.content.appointments[0];
    const source = plan.content.fundingSources[0];
    const before = structuredClone(plan);
    appointment.monthlySalary = 11_000;
    appointment.monthlySalary = 120_000.01 / 12;
    appointment.endDate = source.endDate = '2026-09-30';
    expect(buildPlanChanges(plan).staffing[0].assumptions).toEqual([
      {
        label: 'Appointment end date',
        original: 'Jun 30, 2026',
        planned: 'Sep 30, 2026',
      },
      {
        label: 'Full-time base salary assumption',
        original: '$120,000.00 / year',
        planned: '$120,000.01 / year',
      },
    ]);
    expect(buildPlanChanges(plan).funding[0].dates).toEqual([
      {
        label: 'Funding start date',
        original: 'Dec 1, 2025',
        planned: 'Dec 1, 2025',
      },
      {
        label: 'Funding end date',
        original: 'Jun 30, 2026',
        planned: 'Sep 30, 2026',
      },
    ]);
    Object.assign(appointment, before.content.appointments[0]);
    source.endDate = source.capturedEndDate;
    expect(buildPlanChanges(plan)).toMatchObject({
      funding: [],
      fundingSourceCount: 0,
      staffing: [],
    });
  });

  it('reports edits to an imported source only while they differ from its captured inputs', () => {
    const plan = createSalaryExample();
    const imported = {
      ...plan.content.fundingSources[0],
      capturedAt: '2026-02-12T00:00:00Z',
      projectNumber: 'ANOTHER-PROJECT',
      projectType: 'Sponsored',
    };
    const { draft } = applied(
      addImportedSources(createProjectionSession(plan), [imported])
    );
    const source = draft.content.fundingSources.at(-1)!;
    expect(buildPlanChanges(draft)).toMatchObject({
      funding: [],
      fundingSourceCount: 0,
    });

    source.categoryAdjustments = [
      {
        amount: -500,
        expenditureCategory: source.budgets[0].expenditureCategory,
      },
      { amount: 500, expenditureCategory: '03 - Supplies' },
    ];
    const report = buildPlanChanges(draft);
    expect(report.fundingSourceCount).toBe(1);
    expect(report.funding).toHaveLength(1);
    expect(report.funding[0]).toMatchObject({
      capturedAt: imported.capturedAt,
      categories: [{ adjustment: -500 }, { adjustment: 500 }],
      dates: [
        { original: 'Dec 1, 2025', planned: 'Dec 1, 2025' },
        { original: 'Jun 30, 2026', planned: 'Jun 30, 2026' },
      ],
      total: { adjustment: 0, original: 20_000, revised: 20_000 },
    });

    source.categoryAdjustments = [];
    source.endDate = '2027-09-30';
    expect(buildPlanChanges(draft).funding[0]).toMatchObject({
      dates: [
        { original: 'Dec 1, 2025', planned: 'Dec 1, 2025' },
        {
          label: 'Funding end date',
          original: 'Jun 30, 2026',
          planned: 'Sep 30, 2027',
        },
      ],
      total: { adjustment: 0, original: 20_000, revised: 20_000 },
    });
    source.endDate = source.capturedEndDate;
    expect(buildPlanChanges(draft)).toMatchObject({
      funding: [],
      fundingSourceCount: 0,
    });
  });

  it('shows a pooled adjustment against the full available balance', () => {
    const plan = createSalaryExample();
    plan.content.fundingSources[0].projectType = 'Internal';
    plan.content.fundingSources[0].balanceAdjustment = 500.25;
    expect(buildPlanChanges(plan).funding[0]).toMatchObject({
      categories: [],
      total: { adjustment: 500.25, original: 20_000, revised: 20_500.25 },
    });
  });

  it('nets available category funding including booked costs, exact cents and a new zero budget', () => {
    const plan = createSalaryExample();
    const source = plan.content.fundingSources[0];
    const salary = source.budgets[0].expenditureCategory;
    const supplies = '03 - Supplies';
    const fringe = '02 - Fringe Benefits';
    source.projectType = 'Sponsored';
    source.budgets.push({
      budget: 20_500,
      committed: 500,
      expenditureCategory: supplies,
      spentToDate: 6000,
    });
    source.categoryAdjustments = [
      { amount: 10_000.01, expenditureCategory: salary },
      { amount: 3999.99, expenditureCategory: fringe },
      { amount: -14_000, expenditureCategory: supplies },
      { amount: 0, expenditureCategory: '04 - Equipment' },
    ];
    const [funding] = buildPlanChanges(plan).funding;
    expect(funding.total).toMatchObject({
      adjustment: 0,
      original: 34_000,
      revised: 34_000,
    });
    expect(funding.categories).toEqual([
      {
        adjustment: 10_000.01,
        category: salary,
        original: 20_000,
        revised: expect.closeTo(30_000.01, 2),
      },
      {
        adjustment: 3999.99,
        category: fringe,
        original: null,
        revised: 3999.99,
      },
      { adjustment: -14_000, category: supplies, original: 14_000, revised: 0 },
      { adjustment: 0, category: '04 - Equipment', original: null, revised: 0 },
    ]);
    source.categoryAdjustments[0].amount -= 100.25;
    expect(buildPlanChanges(plan).funding[0].total.adjustment).toBe(-100.25);
    source.categoryAdjustments = [];
    expect(buildPlanChanges(plan).funding).toEqual([]);
  });

  it('compares outside, repeated and partial-day-boundary shares, merging equivalent adjacent changes', () => {
    const original = [row(1, 0.3, null, null), row(null, 0.7, null, null)];
    const split = [
      row(null, 0.7, null, null),
      row(1, 0.1, null, null),
      row(1, 0.2, null, null),
    ];
    expect(compareAllocationSchedules(original, split)).toEqual([]);
    const fractionalShare = 0.123_456_789_012_34;
    expect(
      compareAllocationSchedules(
        [
          row(1, fractionalShare, null, null),
          row(1, fractionalShare, null, null),
        ],
        [row(1, fractionalShare * 2, null, null)]
      )
    ).toEqual([]);
    const planned = [
      ...original.map((r) => ({ ...r, endDate: '2026-04-14' })),
      ...original.map((r) => ({ ...r, startDate: '2026-05-06' })),
      row(1, 0.3, '2026-04-15', '2026-05-05'),
      row(2, 0.5, '2026-04-15', '2026-04-30'),
      row(2, 0.500_000_000_000_01, '2026-05-01', '2026-05-05'),
    ];
    expect(compareAllocationSchedules(original, planned)).toEqual([
      {
        endDate: '2026-05-05',
        shares: [
          { fundingSourceId: 2, original: 0, planned: 0.5 },
          { fundingSourceId: null, original: 0.7, planned: 0 },
        ],
        startDate: '2026-04-15',
      },
    ]);
  });

  it('clears allocation changes when the original displayed share is reapplied', () => {
    const plan = createSalaryExample();
    const appointment = plan.content.appointments[0];
    const [captured, other] = appointment.allocations;
    captured.percent = 0.108_214_518_533_76;
    plan.content.comparison.appointments[0].allocations![0].percent =
      captured.percent;
    const { endDate, fundingSourceId, startDate } = captured;
    const range = { endDate, startDate };
    const edited = applied(
      replaceAppointmentFunding(
        createProjectionSession(plan),
        appointment.id,
        range,
        [{ fundingSourceId, percent: 0.25 }, other]
      )
    );
    expect(buildPlanChanges(edited.draft)).toMatchObject({
      funding: [],
      fundingSourceCount: 1,
      staffing: [{ kind: 'changed' }],
    });

    const reverted = applied(
      replaceAppointmentFunding(edited, appointment.id, range, [
        { fundingSourceId, percent: 10.821_451_853_4 / 100 },
        other,
      ])
    );
    expect(buildPlanChanges(reverted.draft)).toMatchObject({
      funding: [],
      fundingSourceCount: 0,
      staffing: [],
    });
  });

  it('scopes pristine inputs to selected sources, retains an explicit exclusion even after deselection, and reserves retired IDs', () => {
    const plan = createSalaryExample();
    const catalog = createProjectionSession(plan);
    const original = plan.content.comparison;
    const roster = [{ appointmentId: 101, fundingSourceIds: [1, 2] }];
    expect(selectComparisonScope(original, [], roster, new Map())).toEqual({
      appointments: [],
      fundingSources: [],
    });
    const selected = selectedSetupSession(catalog, [1], roster, new Map());
    const removed = applied(removeProjectionAppointment(selected, 101));
    const merged = mergeSetupEdits(catalog, selected, removed, new Map());
    const scoped = selectedSetupSession(
      merged.catalog,
      [1],
      roster,
      merged.edits
    );
    scoped.draft.content.comparison = selectComparisonScope(
      original,
      [1],
      roster,
      merged.edits
    );
    expect(
      scoped.draft.content.comparison.appointments[0].allocations?.map(
        (a) => a.fundingSourceId
      )
    ).toEqual([1]);
    const deselected = selectedSetupSession(
      merged.catalog,
      [2],
      roster,
      merged.edits
    );
    deselected.draft.content.comparison = selectComparisonScope(
      original,
      [2],
      roster,
      merged.edits
    );
    expect(deselected.draft.content.fundingSources.map(({ id }) => id)).toEqual(
      [2]
    );
    const exclusion = buildPlanChanges(deselected.draft);
    expect(exclusion.funding).toEqual([]);
    expect(exclusion.fundingSourceCount).toBe(2);
    expect(exclusion.sourceNames.get(1)).toContain('Project A');
    expect(exclusion.staffing[0].allocations[0].shares).toEqual([
      { fundingSourceId: 1, original: 0.5, planned: 0 },
      { fundingSourceId: 2, original: 0.5, planned: 0 },
    ]);
    const added = applied(
      addProjectionAppointment(createProjectionSession(scoped.draft), {
        ...original.appointments[0],
        name: 'New hire',
      })
    );
    expect(
      buildPlanChanges(added.draft).staffing.map((c) => [
        c.appointment.id,
        c.kind,
      ])
    ).toEqual([
      [102, 'added'],
      [101, 'excluded'],
    ]);
    expect(buildPlanChanges(added.draft)).toMatchObject({
      funding: [],
      fundingSourceCount: 1,
      staffing: [
        { kind: 'added' },
        {
          allocations: [
            { shares: [{ fundingSourceId: 1, original: 0.5, planned: 0 }] },
          ],
          kind: 'excluded',
        },
      ],
    });
    const noSource = applied(removeProjectionSource(added, 1));
    const planned = applied(
      addPlannedSource(createProjectionSession(noSource.draft), {
        balance: 8500,
        endDate: null,
        initialCategoryBudgets: [],
        name: 'Bridge',
        plannedBudgetMode: 'GeneralPool',
        startDate: '2026-01-15',
      })
    );
    const changes = buildPlanChanges(planned.draft).funding;
    expect(changes.map((c) => c.source.id)).toEqual([3]);
    expect(changes[0]).toMatchObject({
      dates: [{ planned: 'Jan 15, 2026' }, { planned: null }],
      plannedSource: true,
      total: { revised: 8500 },
    });
  });

  it('reports removed workspace appointments with both captured source shares', () => {
    const removed = applied(
      removeProjectionAppointment(
        createProjectionSession(createSalaryExample()),
        101
      )
    );
    expect(buildPlanChanges(removed.draft)).toMatchObject({
      funding: [],
      fundingSourceCount: 2,
      staffing: [
        {
          allocations: [
            {
              endDate: '2026-06-30',
              shares: [
                { fundingSourceId: 1, original: 0.5, planned: 0 },
                { fundingSourceId: 2, original: 0.5, planned: 0 },
              ],
              startDate: '2026-01-01',
            },
          ],
          kind: 'excluded',
        },
      ],
    });
  });

  it('compares a reimported task as one source while using the newer financial capture', () => {
    const plan = createSalaryExample();
    const original = plan.content.fundingSources[0];
    const removed = applied(
      removeProjectionSource(createProjectionSession(plan), original.id)
    );
    const reimported = applied(
      addImportedSources(removed, [
        {
          ...original,
          budgets: [{ ...original.budgets[0], budget: 27_500 }],
          capturedAt: '2026-02-12T00:00:00Z',
        },
      ])
    );
    const { draft } = reimported;
    const fresh = draft.content.fundingSources[1];
    expect(fresh.id).toBe(3);
    const shares = draft.content.appointments[0].allocations;
    shares.push({
      ...plan.content.appointments[0].allocations[0],
      fundingSourceId: fresh.id,
    });
    expect(buildPlanChanges(draft)).toMatchObject({
      funding: [],
      fundingSourceCount: 0,
      staffing: [],
    });
    shares[1].percent = 0.25;
    fresh.balanceAdjustment = 10;
    expect(buildPlanChanges(draft)).toMatchObject({
      funding: [
        {
          capturedAt: fresh.capturedAt,
          total: { original: 25_000, revised: 25_010 },
        },
      ],
      fundingSourceCount: 1,
      staffing: [
        {
          allocations: [
            { shares: [{ fundingSourceId: 3, original: 0.5, planned: 0.25 }] },
          ],
        },
      ],
    });
    expect(
      draft.content.comparison.appointments[0].allocations?.[0].fundingSourceId
    ).toBe(1);
  });

  it('distinguishes unavailable staffing capture from an empty schedule', () => {
    const plan = createSalaryExample();
    const capture = plan.content.comparison.appointments[0];
    capture.allocations = null;
    capture.monthlySalary = null;
    const selected = selectComparisonScope(
      plan.content.comparison,
      [1],
      [{ appointmentId: 101, fundingSourceIds: [1, 2] }],
      new Map()
    );
    expect(selected.appointments[0].allocations).toBeNull();
    expect(buildPlanChanges(plan).staffing[0]).toMatchObject({
      allocationCaptureUnavailable: true,
      allocations: [
        {
          shares: [
            { fundingSourceId: 1, original: null, planned: 0.5 },
            { fundingSourceId: 2, original: null, planned: 0.5 },
          ],
        },
      ],
    });
    const removed = applied(
      removeProjectionAppointment(createProjectionSession(plan), 101)
    );
    expect(buildPlanChanges(removed.draft).staffing[0]).toMatchObject({
      allocationCaptureUnavailable: true,
      allocations: [],
      kind: 'excluded',
    });
  });
});
