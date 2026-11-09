import { describe, expect, it } from 'vitest';
import { createSalaryExample } from '@/dev/projections/fixture.ts';
import {
  computePiProjection,
  FEE_REMISSION_CATEGORY,
  SALARY_CATEGORY,
} from '@/lib/piProjection.ts';
import {
  addProjectionAppointment,
  editProjectionAppointment,
  removeProjectionAppointment,
  validateAppointmentInputs,
  validateProjectionAppointments,
  type AppointmentInputs,
  type AppointmentOperationResult,
} from '@/lib/projectionAppointments.ts';
import {
  createProjectionSession,
  isProjectionDirty,
} from '@/lib/projectionWorkspace.ts';
import type { ProjectionDraft } from '@/queries/projections.ts';

function applied<T extends ProjectionDraft>(
  result: AppointmentOperationResult<T>
) {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.session;
}

const newHire: AppointmentInputs = {
  cbrRate: 0.2,
  colaMonth: 7,
  colaRate: 0.03,
  endDate: null,
  feeRemissionMonthly: null,
  fte: 1,
  jobCode: null,
  monthlySalary: 10_000,
  name: 'New hire',
  rateSet: 'DVCMP',
  startDate: '2026-08-01',
  title: null,
};

describe('appointment operations', () => {
  it('changes FTE and dates without rewriting allocation shares, funding dates, or captured identity', () => {
    const initial = createProjectionSession(createSalaryExample());
    const original = initial.draft.appointments[0];
    original.vacationAccrualRate = 0.07;
    const updated = applied(
      editProjectionAppointment(initial, original.id, {
        ...original,
        endDate: '2026-03-31',
        fte: 0.75,
        jobCode: 'Changed code',
        name: 'Changed name',
        rateSet: 'Changed unit',
        title: 'Changed title',
      })
    );
    const appointment = updated.draft.appointments[0];
    expect(appointment).toMatchObject({
      employeeId: original.employeeId,
      endDate: '2026-03-31',
      fte: 0.75,
      jobCode: original.jobCode,
      monthlySalary: original.monthlySalary,
      name: original.name,
      positionNumber: original.positionNumber,
      rateSet: original.rateSet,
      title: original.title,
      vacationAccrualRate: 0.07,
    });
    expect(appointment.allocations).toBe(original.allocations);
    expect(appointment.allocations.map(({ percent }) => percent)).toEqual([
      0.5, 0.5,
    ]);
    expect(appointment.allocations[0].endDate).toBe('2026-06-30');
    expect(updated.draft.fundingSources).toBe(initial.draft.fundingSources);
    expect(
      computePiProjection(updated.draft).rows.find(
        (row) =>
          row.fundingSourceId === 1 &&
          row.month === '2026-02' &&
          row.expenditureCategory === SALARY_CATEGORY
      )?.projectedAmount
    ).toBe(3750);
    expect(updated.revision).toBe(1);
  });

  it('keeps allocations and the entered fee at zero FTE', () => {
    const initial = createProjectionSession(createSalaryExample());
    const original = initial.draft.appointments[0];
    const updated = applied(
      editProjectionAppointment(initial, original.id, {
        ...original,
        feeRemissionMonthly: 1500,
        fte: 0,
      })
    );
    const rows = computePiProjection(updated.draft).rows;
    expect(updated.draft.appointments[0].allocations).toBe(
      original.allocations
    );
    expect(
      rows.find(
        (row) =>
          row.fundingSourceId === 1 &&
          row.month === '2026-02' &&
          row.expenditureCategory === SALARY_CATEGORY
      )?.projectedAmount
    ).toBe(0);
    expect(
      rows.find(
        (row) =>
          row.fundingSourceId === 1 &&
          row.month === '2026-02' &&
          row.expenditureCategory === FEE_REMISSION_CATEGORY
      )?.projectedAmount
    ).toBe(750);
  });

  it('keeps no-op identity and precision, and restoring assumptions clears dirty status', () => {
    const initial = createProjectionSession(createSalaryExample());
    const original = initial.draft.appointments[0];
    original.monthlySalary = 10_000.123_456;
    expect(
      applied(editProjectionAppointment(initial, original.id, original))
    ).toBe(initial);
    const changed = applied(
      editProjectionAppointment(initial, original.id, {
        ...original,
        cbrRate: 0.25,
        fte: 0.75,
      })
    );
    expect(changed.draft.appointments[0].monthlySalary).toBe(
      original.monthlySalary
    );
    const restored = applied(
      editProjectionAppointment(changed, original.id, original)
    );
    expect(isProjectionDirty(restored)).toBe(false);
    expect(restored.revision).toBe(2);
  });

  it('adds an unallocated hypothetical hire to an unsaved draft without importing identity or financials', () => {
    const draft: ProjectionDraft = {
      appointments: [],
      fundingSources: [],
      historyMonths: 3,
      name: 'Draft',
      seededAt: '2026-01-01T00:00:00Z',
    };
    const added = applied(
      addProjectionAppointment(createProjectionSession(draft), newHire)
    );
    expect(added.draft.appointments[0]).toEqual({
      ...newHire,
      allocations: [],
      employeeId: null,
      hasUnmatchedFunding: false,
      id: 1,
      isSeeded: false,
      positionNumber: null,
      vacationAccrualRate: 0,
    });
    expect(draft.appointments).toEqual([]);
    expect(added.draft.fundingSources).toBe(draft.fundingSources);
    expect(Object.keys(added.draft).sort()).toEqual([
      'appointments',
      'fundingSources',
      'historyMonths',
      'name',
      'seededAt',
    ]);
    const second = applied(
      addProjectionAppointment(added, { ...newHire, name: 'Another hire' })
    );
    expect(second.draft.appointments.map(({ id }) => id)).toEqual([1, 2]);
  });

  it('edits planned identity without changing an explicitly entered CBR', () => {
    const added = applied(
      addProjectionAppointment(
        createProjectionSession(createSalaryExample()),
        newHire
      )
    );
    const hire = added.draft.appointments.at(-1)!;
    const edited = applied(
      editProjectionAppointment(added, hire.id, {
        ...hire,
        jobCode: '  123456 ',
        name: ' Named hire ',
        rateSet: 'UCANR',
        title: ' New title ',
      })
    );
    expect(edited.draft.appointments.at(-1)).toMatchObject({
      cbrRate: 0.2,
      jobCode: '123456',
      name: 'Named hire',
      rateSet: 'UCANR',
      title: 'New title',
    });
  });

  it('removes only the selected appointment and its allocations while retaining captured spending', () => {
    const initial = createProjectionSession(createSalaryExample());
    const added = applied(addProjectionAppointment(initial, newHire));
    const removed = applied(
      removeProjectionAppointment(added, initial.draft.appointments[0].id)
    );
    expect(removed.draft.appointments).toHaveLength(1);
    expect(removed.draft.appointments[0].name).toBe(newHire.name);
    expect(removed.draft.fundingSources).toBe(initial.draft.fundingSources);
    expect(removed.draft.fundingSources[0].actuals[0].amount).toBe(2500);
    expect(removeProjectionAppointment(removed, 999)).toMatchObject({
      ok: false,
    });
  });

  it('blocks Create and Save for missing salary, while allowing zero salary, optional fees and unallocated appointments', () => {
    const draft = createSalaryExample();
    draft.appointments[0].monthlySalary = null;
    expect(validateProjectionAppointments(draft)).toContain(
      'Alex Example: Enter a full-time annual salary'
    );
    draft.appointments[0].monthlySalary = 0;
    draft.appointments[0].allocations = [];
    draft.appointments[0].feeRemissionMonthly = null;
    expect(validateProjectionAppointments(draft)).toBeNull();
    draft.appointments[0].feeRemissionMonthly = 0;
    expect(validateProjectionAppointments(draft)).toBeNull();
    expect(
      validateAppointmentInputs({ ...newHire, startDate: null }, true)
    ).not.toBeNull();
    expect(
      validateAppointmentInputs({ ...newHire, startDate: null }, false)
    ).toBeNull();
  });

  it.each([
    { monthlySalary: null },
    { monthlySalary: -1 },
    { monthlySalary: Infinity },
    { fte: -0.01 },
    { fte: 1.01 },
    { fte: Number.NaN },
    { cbrRate: -0.01 },
    { cbrRate: Infinity },
    { colaRate: -1 },
    { colaRate: Number.NaN },
    { colaMonth: 0 },
    { colaMonth: 13 },
    { colaMonth: 7.5 },
    { feeRemissionMonthly: -1 },
    { feeRemissionMonthly: Infinity },
    { startDate: '2026-02-30' },
    { endDate: '2026-07-31' },
    { startDate: null },
    { name: ' ' },
  ])(
    'rejects invalid appointment inputs %j without changing the draft',
    (changes) => {
      const session = createProjectionSession(createSalaryExample());
      expect(
        addProjectionAppointment(session, { ...newHire, ...changes })
      ).toMatchObject({ ok: false });
      expect(session.revision).toBe(0);
      expect(session.draft.appointments).toHaveLength(1);
    }
  );

  it('keeps valid out-of-range dates and accepts boundary percentages without normalizing funding', () => {
    const initial = createProjectionSession(createSalaryExample());
    const appointment = initial.draft.appointments[0];
    const updated = applied(
      editProjectionAppointment(initial, appointment.id, {
        ...appointment,
        cbrRate: 1.5,
        colaRate: -0.999,
        endDate: '2028-02-29',
        fte: 1,
        startDate: '2028-02-29',
      })
    );
    expect(updated.draft.appointments[0].startDate).toBe('2028-02-29');
    expect(updated.draft.appointments[0].allocations).toBe(
      appointment.allocations
    );
    expect(validateProjectionAppointments(updated.draft)).toBeNull();
  });
});
