import { describe, expect, it } from 'vitest';
import { computePiProjection, SALARY_CATEGORY } from '@/lib/piProjection.ts';
import {
  acknowledgeProjectionSave,
  createProjectionSession,
  isProjectionDirty,
  readProjectionLocation,
  readProjectionWorkspace,
  setJobMonthlySalary,
} from '@/lib/projectionWorkspace.ts';
import { createSalaryExample } from '@/dev/projections/fixture.ts';

describe('salary workspace operations without React', () => {
  it('acknowledges a submitted draft with exact authoritative tokens', () => {
    const initial = createProjectionSession(createSalaryExample());
    const change = setJobMonthlySalary(initial, {
      jobId: 101,
      monthlySalary: 11_000,
    });
    if (!change.ok) {
      throw new Error(change.error);
    }
    const submitted = change.session;
    const saved = {
      ...submitted.draft,
      updatedAt: '2026-11-06T19:00:00.1234567Z',
      updatedBy: 'Editor',
    };
    const acknowledged = acknowledgeProjectionSave(submitted, submitted, saved);
    expect(acknowledged.baseline).toBe(saved);
    expect(acknowledged.draft).toBe(saved);
    expect(acknowledged.revision).toBe(submitted.revision);
    expect(isProjectionDirty(acknowledged)).toBe(false);
  });

  it('retains newer applied edits while acknowledging only the submitted version', () => {
    const initial = createProjectionSession(createSalaryExample());
    const change = setJobMonthlySalary(initial, {
      jobId: 101,
      monthlySalary: 11_000,
    });
    if (!change.ok) {
      throw new Error(change.error);
    }
    const submitted = change.session;
    const newer = setJobMonthlySalary(submitted, {
      jobId: 101,
      monthlySalary: 12_000,
    });
    if (!newer.ok) {
      throw new Error(newer.error);
    }
    const saved = {
      ...submitted.draft,
      updatedAt: '2026-11-06T19:00:00.1234567Z',
      updatedBy: 'Editor',
    };
    const acknowledged = acknowledgeProjectionSave(
      newer.session,
      submitted,
      saved
    );
    expect(acknowledged.baseline).toBe(saved);
    expect(acknowledged.draft.jobs).toBe(newer.session.draft.jobs);
    expect(acknowledged.draft.jobs[0].monthlySalary).toBe(12_000);
    expect(acknowledged.baseline.jobs[0].monthlySalary).toBe(11_000);
    expect(acknowledged.draft.updatedAt).toBe('2026-11-06T19:00:00.1234567Z');
    expect(acknowledged.draft.updatedBy).toBe('Editor');
    expect(acknowledged.draft.seededAt).toBe(initial.draft.seededAt);
    expect(acknowledged.revision).toBe(newer.session.revision);
    expect(isProjectionDirty(acknowledged)).toBe(true);
  });

  it('charges each project 2500 then 2750 for every fixed forecast month and preserves history and funding', () => {
    const initial = createProjectionSession(createSalaryExample());
    const before = computePiProjection(initial.draft);
    const result = setJobMonthlySalary(initial, {
      jobId: 101,
      monthlySalary: 132_000 / 12,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error);
    }
    const after = computePiProjection(result.session.draft);

    for (const projectId of [1, 2]) {
      const salaryRows = (rows: typeof before.rows) =>
        rows.filter(
          (row) =>
            row.projectId === projectId &&
            row.expenditureCategory === SALARY_CATEGORY &&
            row.kind !== 'actual'
        );
      expect(
        salaryRows(before.rows).map((row) => [row.month, row.projectedAmount])
      ).toEqual([
        ['2026-01', 2500],
        ['2026-02', 2500],
        ['2026-03', 2500],
        ['2026-04', 2500],
        ['2026-05', 2500],
        ['2026-06', 2500],
      ]);
      expect(salaryRows(after.rows).map((row) => row.projectedAmount)).toEqual(
        Array(6).fill(2750)
      );
    }
    expect(after.rows.filter((row) => row.kind === 'actual')).toEqual(
      before.rows.filter((row) => row.kind === 'actual')
    );
    expect(result.session.draft.jobs[0].fte).toBe(0.5);
    expect(result.session.draft.jobs[0].fundingEntries).toBe(
      initial.draft.jobs[0].fundingEntries
    );
    expect(result.session.draft.projects).toBe(initial.draft.projects);
    expect(result.session.draft.seededAt).toBe(initial.draft.seededAt);
    expect(initial.draft.jobs[0].monthlySalary).toBe(10_000);
    expect(result.session.revision).toBe(1);
    expect(isProjectionDirty(result.session)).toBe(true);
  });

  it('keeps no-op identity and clears dirty status when the original salary is restored', () => {
    const initial = createProjectionSession(createSalaryExample());
    const unchanged = setJobMonthlySalary(initial, {
      jobId: 101,
      monthlySalary: 10_000,
    });
    if (!unchanged.ok) {
      throw new Error(unchanged.error);
    }
    expect(unchanged.session).toBe(initial);
    const changed = setJobMonthlySalary(initial, {
      jobId: 101,
      monthlySalary: 11_000,
    });
    if (!changed.ok) {
      throw new Error(changed.error);
    }
    const restored = setJobMonthlySalary(changed.session, {
      jobId: 101,
      monthlySalary: 10_000,
    });
    if (!restored.ok) {
      throw new Error(restored.error);
    }
    expect(restored.session.revision).toBe(2);
    expect(isProjectionDirty(restored.session)).toBe(false);
  });

  it.each([-1, Number.NaN, Infinity, Number.MAX_VALUE])(
    'rejects an invalid monthly amount %s',
    (monthlySalary) => {
      const session = createProjectionSession(createSalaryExample());
      expect(
        setJobMonthlySalary(session, { jobId: 101, monthlySalary }).ok
      ).toBe(false);
      expect(session.revision).toBe(0);
    }
  );

  it('accepts zero and rejects a missing stable job target', () => {
    const session = createProjectionSession(createSalaryExample());
    expect(
      setJobMonthlySalary(session, { jobId: 999, monthlySalary: 11_000 })
    ).toMatchObject({ ok: false });
    const zero = setJobMonthlySalary(session, { jobId: 101, monthlySalary: 0 });
    if (!zero.ok) {
      throw new Error(zero.error);
    }
    expect(
      computePiProjection(zero.session.draft).rows.every(
        (row) => row.projectedAmount === 0
      )
    ).toBe(true);
  });

  it('returns an observational snapshot, including editor status, without exposing the live draft', () => {
    const session = createProjectionSession(createSalaryExample());
    const results = computePiProjection(session.draft);
    const location = readProjectionLocation(
      { job: 101, project: 2, section: 'staffing' },
      session.draft
    );
    const snapshot = readProjectionWorkspace(session, location, results, {
      hasChanges: true,
      jobId: 101,
      validationMessage: null,
    });
    expect(snapshot).toMatchObject({
      dirty: false,
      location: { jobId: 101, projectId: 2 },
      pendingEditor: { hasChanges: true },
      revision: 0,
    });
    snapshot.draft.jobs[0].monthlySalary = 1;
    snapshot.results.rows[0].actualAmount = 1;
    snapshot.location.issues.push('Changed externally');
    expect(session.draft.jobs[0].monthlySalary).toBe(10_000);
    expect(results.rows[0].actualAmount).toBe(2500);
    expect(location.issues).toEqual([]);
  });
});
