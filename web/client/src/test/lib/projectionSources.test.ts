import { describe, expect, it } from 'vitest';
import { createSalaryExample } from '@/dev/projections/fixture.ts';
import { computePiProjection } from '@/lib/piProjection.ts';
import {
  addImportedSources,
  addPlannedSource,
  editProjectionSource,
  removeProjectionSource,
  selectInitialSources,
  sourceCapturedBalance,
  sourcePlanningBalance,
  sourcesOverlap,
  type SourceOperationResult,
} from '@/lib/projectionSources.ts';
import {
  acknowledgeProjectionSave,
  createProjectionSession,
  isProjectionDirty,
  readProjectionLocation,
} from '@/lib/projectionWorkspace.ts';
import type { ProjectionDraft } from '@/queries/projections.ts';

const session = () => createProjectionSession(createSalaryExample());
function applied<T extends ProjectionDraft>(result: SourceOperationResult<T>) {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.session;
}
const planned = {
  balance: 100_000,
  endDate: '2026-12-31',
  name: 'Planned grant',
  startDate: '2026-07-01',
};

describe('funding source operations', () => {
  it('edits an unsaved draft without saved identity or audit fields', () => {
    const { content, name, seededAt } = createSalaryExample();
    const draft: ProjectionDraft = { content, name, seededAt };
    const added = applied(
      addPlannedSource(createProjectionSession(draft), planned)
    );
    expect(added.draft.content.fundingSources.at(-1)).toMatchObject({
      name: planned.name,
      projectName: null,
    });
    expect(Object.keys(added.draft).sort()).toEqual([
      'content',
      'name',
      'seededAt',
    ]);
    expect(Object.keys(added.draft.content).sort()).toEqual([
      'appointments',
      'forecastMonths',
      'fundingSources',
      'historyMonths',
      'notes',
    ]);
    expect(draft.content.fundingSources).toHaveLength(2);
  });

  it('edits scenario balance and dates without replacing captured financials, then restores clean state', () => {
    const original = session();
    const source = original.draft.content.fundingSources[0];
    const changed = applied(
      editProjectionSource(original, source.id, {
        balance: -2500,
        endDate: '2027-12-31',
        name: 'Revised source',
        startDate: source.startDate,
      })
    );
    const edited = changed.draft.content.fundingSources[0];
    expect(sourceCapturedBalance(edited)).toBe(20_000);
    expect(sourcePlanningBalance(edited)).toBe(-2500);
    expect(edited.budgets).toBe(source.budgets);
    expect(edited.actuals).toBe(source.actuals);
    expect(edited.name).toBe('Revised source');
    expect(edited.projectName).toBe(source.projectName);
    expect(edited.capturedEndDate).toBe(source.endDate);
    expect(isProjectionDirty(changed)).toBe(true);
    const restored = applied(
      editProjectionSource(changed, source.id, {
        balance: 20_000,
        endDate: source.endDate,
        name: source.name,
        startDate: source.startDate,
      })
    );
    expect(restored.revision).toBe(2);
    expect(isProjectionDirty(restored)).toBe(false);
    expect(original.draft.content.fundingSources[0]).toBe(source);
  });

  it('retains intentionally missing captured dates across edits', () => {
    const original = session();
    Object.assign(original.draft.content.fundingSources[0], {
      capturedAt: original.draft.seededAt,
      capturedEndDate: null,
      capturedStartDate: null,
    });
    const edited = applied(
      editProjectionSource(original, 1, { ...planned, balance: 20_000 })
    );
    expect(edited.draft.content.fundingSources[0].capturedStartDate).toBeNull();
    expect(edited.draft.content.fundingSources[0].capturedEndDate).toBeNull();
  });

  it('creates planned sources only when applied and gives current sources unique IDs', () => {
    const original = session();
    const added = applied(addPlannedSource(original, planned));
    const first = added.draft.content.fundingSources.at(-1)!;
    expect(original.draft.content.fundingSources).toHaveLength(2);
    expect(first).toMatchObject({
      balanceAdjustment: 100_000,
      budgets: [],
      capturedAt: original.draft.seededAt,
      sourceKind: 'Planned',
    });
    const removed = applied(removeProjectionSource(added, first.id));
    expect(isProjectionDirty(removed)).toBe(false);
    const next = applied(addPlannedSource(added, planned));
    expect(next.draft.content.fundingSources.map(({ id }) => id)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it('re-adds fresh source inputs without restoring removed allocations or adjustments', () => {
    const original = session();
    const source = original.draft.content.fundingSources[1];
    source.projectNumber = 'P1';
    source.taskNumber = 'T1';
    source.sourceKind = 'Task';
    source.capturedAt = original.draft.seededAt;
    source.balanceAdjustment = 5000;
    const removed = applied(removeProjectionSource(original, source.id));
    const fresh = {
      ...structuredClone(source),
      balanceAdjustment: 0,
      capturedAt: '2026-03-16T00:00:00Z',
      expenses: [],
    };
    fresh.budgets[0].budget = 50_000;
    const readded = applied(addImportedSources(removed, [fresh]));
    expect(readded.draft.content.fundingSources.map(({ id }) => id)).toEqual([
      1, 2,
    ]);
    expect(readded.draft.content.fundingSources[1]).toEqual(fresh);
    expect(readded.draft.content.appointments[0].allocations).toEqual(
      original.draft.content.appointments[0].allocations.filter(
        ({ fundingSourceId }) => fundingSourceId !== source.id
      )
    );
  });

  it('adds fresh financial sources without adding employees or funding and rejects overlapping tasks atomically', () => {
    const original = session();
    const source = {
      ...structuredClone(original.draft.content.fundingSources[0]),
      capturedAt: '2026-03-16T00:00:00Z',
      projectNumber: 'NEW',
      sourceKind: 'Task' as const,
      taskNumber: 'T1',
    };
    const added = applied(addImportedSources(original, [source]));
    expect(added.draft.content.appointments).toBe(
      original.draft.content.appointments
    );
    expect(added.draft.content.fundingSources.at(-1)!.id).toBe(3);
    expect(added.draft.content.fundingSources.at(-1)).not.toBe(source);
    expect(added.draft.content.fundingSources.at(-1)!.capturedAt).toBe(
      source.capturedAt
    );
    expect(
      addImportedSources(added, [{ ...source, taskNumber: 'T2' }, source]).ok
    ).toBe(false);
    expect(added.draft.content.fundingSources).toHaveLength(3);
    expect(sourcesOverlap(source, { ...source, taskNumber: 'T2' })).toBe(false);
    expect(sourcesOverlap(source, { ...source, taskNumber: null })).toBe(false);
    expect(
      sourcesOverlap(
        { ...source, taskNumber: null },
        { ...source, taskNumber: '' }
      )
    ).toBe(true);
  });

  it('removes a source and its allocation shares without discarding people or filling the gap', () => {
    const original = session();
    original.draft.content.appointments[0].allocations.push({
      endDate: null,
      fundingSourceId: null,
      percent: 0.1,
      startDate: null,
    });
    const removed = applied(removeProjectionSource(original, 1));
    expect(removed.draft.content.fundingSources.map(({ id }) => id)).toEqual([
      2,
    ]);
    expect(removed.draft.content.appointments).toHaveLength(1);
    expect(
      removed.draft.content.appointments[0].allocations.map(
        ({ fundingSourceId, percent }) => [fundingSourceId, percent]
      )
    ).toEqual([
      [2, 0.5],
      [null, 0.1],
    ]);
    expect(
      computePiProjection(removed.draft).appointmentFunding[0].fundedPercent
    ).toBeCloseTo(0.6);
    expect(original.draft.content.appointments[0].allocations).toHaveLength(3);
  });

  it('selects exact task provenance, retaining Unsplit appointments but excluding unmatched-only people', () => {
    const original = session();
    const appointment = original.draft.content.appointments[0];
    appointment.hasUnmatchedFunding = true;
    appointment.allocations.push({
      ...appointment.allocations[0],
      fundingSourceId: null,
      percent: 0.1,
    });
    original.draft.content.appointments.push(
      {
        ...structuredClone(appointment),
        allocations: [],
        id: 102,
        monthlySalary: null,
      },
      { ...structuredClone(appointment), allocations: [], id: 103 },
      {
        ...structuredClone(appointment),
        allocations: [appointment.allocations[1]],
        id: 104,
      }
    );
    const selected = applied(
      selectInitialSources(
        original,
        [1],
        [
          { appointmentId: 101, fundingSourceIds: [1, 2] },
          { appointmentId: 102, fundingSourceIds: [1] },
          { appointmentId: 103, fundingSourceIds: [] },
          { appointmentId: 104, fundingSourceIds: [2] },
        ]
      )
    );
    expect(selected.draft.content.appointments.map(({ id }) => id)).toEqual([
      101, 102,
    ]);
    expect(selected.draft.content.appointments[0]).toMatchObject({
      allocations: [appointment.allocations[0], appointment.allocations[2]],
      hasUnmatchedFunding: true,
    });
    expect(selected.draft.content.appointments[1]).toMatchObject({
      allocations: [],
      monthlySalary: null,
    });
    expect(selected.draft.content.fundingSources.map(({ id }) => id)).toEqual([
      1,
    ]);
  });

  it('retains source edits applied during a save and compares structural content regardless of property order', () => {
    const original = session();
    const submitted = applied(addPlannedSource(original, planned));
    const newer = applied(removeProjectionSource(submitted, 1));
    const saved = {
      ...structuredClone(submitted.draft),
      updatedAt: '2026-01-02T00:00:00.1234567Z',
    };
    const acknowledged = acknowledgeProjectionSave(newer, submitted, saved);
    expect(
      acknowledged.draft.content.fundingSources.map(({ id }) => id)
    ).toEqual([2, 3]);
    expect(acknowledged.draft.updatedAt).toBe(saved.updatedAt);
    expect(isProjectionDirty(acknowledged)).toBe(true);
    const reordered = {
      ...original,
      draft: {
        ...original.draft,
        content: {
          ...original.draft.content,
          fundingSources: original.draft.content.fundingSources.map(
            (source) =>
              Object.fromEntries(
                Object.entries(source).reverse()
              ) as typeof source
          ),
        },
      },
    };
    expect(isProjectionDirty(reordered)).toBe(false);
    expect(
      readProjectionLocation({ section: 'funding', source: 1 }, original.draft)
    ).toMatchObject({ fundingSourceId: 1, issues: [], section: 'funding' });
  });

  it.each([
    { balance: Infinity },
    { balance: Number.NaN },
    { name: ' ' },
    { name: 'x'.repeat(201) },
    { startDate: '2026-02-30' },
    { startDate: '0000-01-01' },
    { startDate: null },
    { endDate: '2026-06-01' },
  ])(
    'rejects invalid planned source inputs %j without changing the session',
    (invalid) => {
      const original = session();
      expect(addPlannedSource(original, { ...planned, ...invalid }).ok).toBe(
        false
      );
      expect(original.revision).toBe(0);
    }
  );
});
