import { describe, expect, it } from 'vitest';
import { computePiProjection, SALARY_CATEGORY } from '@/lib/piProjection.ts';
import {
  acknowledgeProjectionSave,
  createProjectionSession,
  isProjectionDirty,
  readProjectionLocation,
  readProjectionWorkspace,
  setAppointmentMonthlySalary,
} from '@/lib/projectionWorkspace.ts';
import { createSalaryExample } from '@/dev/projections/fixture.ts';

describe('salary workspace operations without React', () => {
  it('opens canonical source and appointment targets', () => {
    const plan = createSalaryExample();
    expect(
      readProjectionLocation({ appointment: '101', source: '2' }, plan)
    ).toEqual({
      appointmentId: 101,
      fundingSourceId: 2,
      issues: [],
      section: 'staffing',
    });
    expect(
      readProjectionLocation({ section: 'funding', source: 1 }, plan)
    ).toEqual({
      appointmentId: null,
      fundingSourceId: 1,
      issues: [],
      section: 'funding',
    });
  });

  it('acknowledges a submitted draft with exact authoritative tokens', () => {
    const initial = createProjectionSession(createSalaryExample());
    const change = setAppointmentMonthlySalary(initial, {
      appointmentId: 101,
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
    const change = setAppointmentMonthlySalary(initial, {
      appointmentId: 101,
      monthlySalary: 11_000,
    });
    if (!change.ok) {
      throw new Error(change.error);
    }
    const submitted = change.session;
    const newer = setAppointmentMonthlySalary(submitted, {
      appointmentId: 101,
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
    expect(acknowledged.draft.appointments).toBe(
      newer.session.draft.appointments
    );
    expect(acknowledged.draft.appointments[0].monthlySalary).toBe(12_000);
    expect(acknowledged.baseline.appointments[0].monthlySalary).toBe(11_000);
    expect(acknowledged.draft.updatedAt).toBe('2026-11-06T19:00:00.1234567Z');
    expect(acknowledged.draft.updatedBy).toBe('Editor');
    expect(acknowledged.draft.seededAt).toBe(initial.draft.seededAt);
    expect(acknowledged.revision).toBe(newer.session.revision);
    expect(isProjectionDirty(acknowledged)).toBe(true);
  });

  it('charges each source 2500 then 2750 for every fixed forecast month and preserves history and funding', () => {
    const initial = createProjectionSession(createSalaryExample());
    const before = computePiProjection(initial.draft);
    const result = setAppointmentMonthlySalary(initial, {
      appointmentId: 101,
      monthlySalary: 132_000 / 12,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error);
    }
    const after = computePiProjection(result.session.draft);

    for (const fundingSourceId of [1, 2]) {
      const salaryRows = (rows: typeof before.rows) =>
        rows.filter(
          (row) =>
            row.fundingSourceId === fundingSourceId &&
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
    expect(result.session.draft.appointments[0].fte).toBe(0.5);
    expect(result.session.draft.appointments[0].allocations).toBe(
      initial.draft.appointments[0].allocations
    );
    expect(result.session.draft.fundingSources).toBe(
      initial.draft.fundingSources
    );
    expect(result.session.draft.seededAt).toBe(initial.draft.seededAt);
    expect(initial.draft.appointments[0].monthlySalary).toBe(10_000);
    expect(result.session.revision).toBe(1);
    expect(isProjectionDirty(result.session)).toBe(true);
  });

  it('keeps no-op identity and clears dirty status when the original salary is restored', () => {
    const initial = createProjectionSession(createSalaryExample());
    const unchanged = setAppointmentMonthlySalary(initial, {
      appointmentId: 101,
      monthlySalary: 10_000,
    });
    if (!unchanged.ok) {
      throw new Error(unchanged.error);
    }
    expect(unchanged.session).toBe(initial);
    const changed = setAppointmentMonthlySalary(initial, {
      appointmentId: 101,
      monthlySalary: 11_000,
    });
    if (!changed.ok) {
      throw new Error(changed.error);
    }
    const restored = setAppointmentMonthlySalary(changed.session, {
      appointmentId: 101,
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
        setAppointmentMonthlySalary(session, {
          appointmentId: 101,
          monthlySalary,
        }).ok
      ).toBe(false);
      expect(session.revision).toBe(0);
    }
  );

  it('accepts zero and rejects a missing stable appointment target', () => {
    const session = createProjectionSession(createSalaryExample());
    expect(
      setAppointmentMonthlySalary(session, {
        appointmentId: 999,
        monthlySalary: 11_000,
      })
    ).toMatchObject({ ok: false });
    const zero = setAppointmentMonthlySalary(session, {
      appointmentId: 101,
      monthlySalary: 0,
    });
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
      { appointment: 101, section: 'staffing', source: 2 },
      session.draft
    );
    const snapshot = readProjectionWorkspace(session, location, results, {
      appointmentId: 101,
      hasChanges: true,
      validationMessage: null,
    });
    expect(snapshot).toMatchObject({
      dirty: false,
      location: { appointmentId: 101, fundingSourceId: 2 },
      pendingEditor: { hasChanges: true },
      revision: 0,
    });
    snapshot.draft.appointments[0].monthlySalary = 1;
    snapshot.results.rows[0].actualAmount = 1;
    snapshot.location.issues.push('Changed externally');
    expect(session.draft.appointments[0].monthlySalary).toBe(10_000);
    expect(results.rows[0].actualAmount).toBe(2500);
    expect(location.issues).toEqual([]);
  });
});
