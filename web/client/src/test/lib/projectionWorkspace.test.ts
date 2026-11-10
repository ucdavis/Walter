import { describe, expect, it } from 'vitest';
import { computePiProjection, SALARY_CATEGORY } from '@/lib/piProjection.ts';
import {
  acknowledgeProjectionSave,
  createProjectionSession,
  isProjectionDirty,
  readProjectionLocation,
  readProjectionWorkspace,
} from '@/lib/projectionWorkspace.ts';
import { editProjectionAppointment } from '@/lib/projectionAppointments.ts';
import { createSalaryExample } from '@/test/fixtures/projections.ts';

describe('salary workspace operations without React', () => {
  it('opens canonical source and appointment targets', () => {
    const plan = createSalaryExample();
    expect(
      readProjectionLocation({ appointment: '101', source: '2' }, plan)
    ).toEqual({
      appointmentId: 101,
      fundingMonth: null,
      fundingSourceId: 2,
      issues: [],
      section: 'staffing',
    });
    expect(
      readProjectionLocation({ section: 'funding', source: 1 }, plan)
    ).toEqual({
      appointmentId: null,
      fundingMonth: null,
      fundingSourceId: 1,
      issues: [],
      section: 'funding',
    });
  });

  it('opens allocation months only for a valid appointment target', () => {
    const plan = createSalaryExample();
    expect(
      readProjectionLocation(
        { appointment: 101, fundingMonth: '2026-07', section: 'staffing' },
        plan
      )
    ).toMatchObject({
      appointmentId: 101,
      fundingMonth: '2026-07',
      issues: [],
    });
    for (const fundingMonth of ['2026-99', '0000-01', '2026-1', 202_607]) {
      expect(
        readProjectionLocation(
          { appointment: 101, fundingMonth, section: 'staffing' },
          plan
        ).issues
      ).toContain('The funding month target is malformed.');
    }
    expect(
      readProjectionLocation(
        { fundingMonth: '2026-07', section: 'staffing' },
        plan
      ).issues
    ).toContain('A funding month requires an appointment.');
  });

  it('acknowledges a submitted draft with exact authoritative tokens', () => {
    const initial = createProjectionSession(createSalaryExample());
    const change = editProjectionAppointment(initial, 101, {
      ...initial.draft.content.appointments[0],
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
    const change = editProjectionAppointment(initial, 101, {
      ...initial.draft.content.appointments[0],
      monthlySalary: 11_000,
    });
    if (!change.ok) {
      throw new Error(change.error);
    }
    const submitted = change.session;
    const newer = editProjectionAppointment(submitted, 101, {
      ...submitted.draft.content.appointments[0],
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
    expect(acknowledged.draft.content.appointments).toBe(
      newer.session.draft.content.appointments
    );
    expect(acknowledged.draft.content.appointments[0].monthlySalary).toBe(
      12_000
    );
    expect(acknowledged.baseline.content.appointments[0].monthlySalary).toBe(
      11_000
    );
    expect(acknowledged.draft.updatedAt).toBe('2026-11-06T19:00:00.1234567Z');
    expect(acknowledged.draft.updatedBy).toBe('Editor');
    expect(acknowledged.draft.seededAt).toBe(initial.draft.seededAt);
    expect(acknowledged.revision).toBe(newer.session.revision);
    expect(isProjectionDirty(acknowledged)).toBe(true);
  });

  it('charges each source 2500 then 2750 for every fixed forecast month and preserves history and funding', () => {
    const initial = createProjectionSession(createSalaryExample());
    const before = computePiProjection(initial.draft);
    const result = editProjectionAppointment(initial, 101, {
      ...initial.draft.content.appointments[0],
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
            row.expenditureCategory === SALARY_CATEGORY
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
        ...['07', '08', '09', '10', '11', '12'].map((month) => [
          `2026-${month}`,
          0,
        ]),
      ]);
      expect(salaryRows(after.rows).map((row) => row.projectedAmount)).toEqual([
        ...Array(6).fill(2750),
        ...Array(6).fill(0),
      ]);
    }
    expect(after.rows.every((row) => row.month >= '2026-01')).toBe(true);
    expect(result.session.draft.content.fundingSources[0].actuals).toEqual(
      initial.draft.content.fundingSources[0].actuals
    );
    expect(result.session.draft.content.appointments[0].fte).toBe(0.5);
    expect(result.session.draft.content.appointments[0].allocations).toBe(
      initial.draft.content.appointments[0].allocations
    );
    expect(result.session.draft.content.fundingSources).toBe(
      initial.draft.content.fundingSources
    );
    expect(result.session.draft.seededAt).toBe(initial.draft.seededAt);
    expect(initial.draft.content.appointments[0].monthlySalary).toBe(10_000);
    expect(result.session.revision).toBe(1);
    expect(isProjectionDirty(result.session)).toBe(true);
  });

  it('keeps no-op identity and clears dirty status when the original salary is restored', () => {
    const initial = createProjectionSession(createSalaryExample());
    const unchanged = editProjectionAppointment(initial, 101, {
      ...initial.draft.content.appointments[0],
      monthlySalary: 10_000,
    });
    if (!unchanged.ok) {
      throw new Error(unchanged.error);
    }
    expect(unchanged.session).toBe(initial);
    const changed = editProjectionAppointment(initial, 101, {
      ...initial.draft.content.appointments[0],
      monthlySalary: 11_000,
    });
    if (!changed.ok) {
      throw new Error(changed.error);
    }
    const restored = editProjectionAppointment(changed.session, 101, {
      ...changed.session.draft.content.appointments[0],
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
        editProjectionAppointment(session, 101, {
          ...session.draft.content.appointments[0],
          monthlySalary,
        }).ok
      ).toBe(false);
      expect(session.revision).toBe(0);
    }
  );

  it('accepts zero and rejects a missing stable appointment target', () => {
    const session = createProjectionSession(createSalaryExample());
    expect(
      editProjectionAppointment(session, 999, {
        ...session.draft.content.appointments[0],
        monthlySalary: 11_000,
      })
    ).toMatchObject({ ok: false });
    const zero = editProjectionAppointment(session, 101, {
      ...session.draft.content.appointments[0],
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
      kind: 'appointment',
      validationMessage: null,
    });
    expect(snapshot).toMatchObject({
      dirty: false,
      location: { appointmentId: 101, fundingSourceId: 2 },
      pendingEditor: { hasChanges: true },
      revision: 0,
    });
    snapshot.draft.content.appointments[0].monthlySalary = 1;
    snapshot.results.rows[0].actualAmount = 1;
    snapshot.location.issues.push('Changed externally');
    expect(session.draft.content.appointments[0].monthlySalary).toBe(10_000);
    expect(results.rows[0].actualAmount).toBe(0);
    expect(location.issues).toEqual([]);
  });
});
