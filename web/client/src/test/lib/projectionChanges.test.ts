import { describe, expect, it } from 'vitest';
import { buildPlanChanges } from '@/lib/projectionChanges.ts';
import { compareAllocationSchedules } from '@/lib/projectionAllocations.ts';
import { createProjectionSession } from '@/lib/projectionWorkspace.ts';
import {
  mergeSetupEdits,
  selectSetupScope,
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
    appointment.monthlySalary = 12_000;
    appointment.endDate = source.endDate = '2026-09-30';
    expect(buildPlanChanges(plan).staffing[0].assumptions).toEqual([
      {
        label: 'Appointment end date',
        original: 'Jun 30, 2026',
        planned: 'Sep 30, 2026',
      },
      {
        label: 'Full-time base salary assumption',
        original: '$10,000.00 / month',
        planned: '$12,000.00 / month',
      },
    ]);
    expect(buildPlanChanges(plan).funding[0].dates).toEqual([
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
      capturedAt: plan.seededAt,
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
      categories: [{ adjustment: -500 }, { adjustment: 500 }],
      dates: [],
      total: { adjustment: 0, original: 20_000, revised: 20_000 },
    });

    source.categoryAdjustments = [];
    source.endDate = '2027-09-30';
    expect(buildPlanChanges(draft).funding[0]).toMatchObject({
      dates: [
        {
          label: 'Funding end date',
          original: 'Jun 30, 2026',
          planned: 'Sep 30, 2027',
        },
      ],
      total: null,
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
        revised: 30_000.01,
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
    expect(buildPlanChanges(plan).funding[0].total?.adjustment).toBe(-100.25);
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
    const planned = [
      ...original.map((r) => ({ ...r, endDate: '2026-04-14' })),
      ...original.map((r) => ({ ...r, startDate: '2026-05-06' })),
      row(1, 0.3, '2026-04-15', '2026-05-05'),
      row(2, 0.5, '2026-04-15', '2026-04-30'),
      row(2, 0.5, '2026-05-01', '2026-05-05'),
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

  it('scopes pristine inputs to selected sources, retains an explicit exclusion even after deselection, and reserves retired IDs', () => {
    const plan = createSalaryExample();
    const catalog = createProjectionSession(plan);
    const original = plan.content.comparison;
    const roster = [{ appointmentId: 101, fundingSourceIds: [1, 2] }];
    expect(selectSetupScope(original, [], roster, new Set())).toEqual({
      appointments: [],
      fundingSources: [],
    });
    const selected = selectedSetupSession(catalog, [1], roster, new Set());
    const removed = applied(removeProjectionAppointment(selected, 101));
    const merged = mergeSetupEdits(catalog, selected, removed, new Set());
    const scoped = selectedSetupSession(
      merged.catalog,
      [1],
      roster,
      merged.editedAppointmentIds
    );
    scoped.draft.content.comparison = selectSetupScope(
      original,
      [1],
      roster,
      merged.editedAppointmentIds
    );
    expect(
      scoped.draft.content.comparison.appointments[0].allocations.map(
        (a) => a.fundingSourceId
      )
    ).toEqual([1]);
    expect(
      selectSetupScope(original, [], roster, merged.editedAppointmentIds)
        .appointments
    ).toHaveLength(1);
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
    expect(buildPlanChanges(added.draft).funding).toEqual([]);
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
});
