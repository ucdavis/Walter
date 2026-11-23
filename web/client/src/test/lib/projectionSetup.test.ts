import { describe, expect, it } from 'vitest';
import {
  selectedSetupSession,
  mergeSetupEdits,
} from '@/lib/projectionSetup.ts';
import { createProjectionSession } from '@/lib/projectionWorkspace.ts';
import {
  addProjectionAppointment,
  editProjectionAppointment,
  removeProjectionAppointment,
} from '@/lib/projectionAppointments.ts';
import { createSalaryExample } from '@/test/fixtures/projections.ts';
import { computePiProjection } from '@/lib/piProjection.ts';

function fixture() {
  const plan = createSalaryExample();
  plan.content.lastAppointmentId = 102;
  plan.content.appointments.push({
    ...structuredClone(plan.content.appointments[0]),
    allocations: [
      { ...plan.content.appointments[0].allocations[1], percent: 1 },
    ],
    id: 102,
    name: 'Blair',
  });
  return {
    catalog: createProjectionSession(plan),
    roster: [
      { appointmentId: 101, fundingSourceIds: [1, 2] },
      { appointmentId: 102, fundingSourceIds: [2] },
    ],
  };
}

describe('setup funding selection', () => {
  it('restores the same shared roster and costs when projects are selected in stages or removed and readded', () => {
    const { catalog, roster } = fixture();
    const direct = selectedSetupSession(catalog, [1, 2], roster, new Map());
    for (const ids of [[], [1], [2], [], [1, 2]]) {
      const active = selectedSetupSession(catalog, ids, roster, new Map());
      const merged = mergeSetupEdits(catalog, active, active, new Map());
      const restored = selectedSetupSession(
        merged.catalog,
        [1, 2],
        roster,
        merged.edits
      );
      expect(restored.draft.content).toEqual(direct.draft.content);
      expect(computePiProjection(restored.draft)).toEqual(
        computePiProjection(direct.draft)
      );
    }
  });

  it('preserves salary and allocation edits while including staff from a later selected task', () => {
    const { catalog, roster } = fixture();
    const active = selectedSetupSession(catalog, [1], roster, new Map());
    const operation = editProjectionAppointment(active, 101, {
      ...active.draft.content.appointments[0],
      monthlySalary: 12_345,
    });
    if (!operation.ok) {
      throw new Error(operation.error);
    }
    operation.session.draft.content.appointments[0].allocations[0].percent = 0.25;
    const merged = mergeSetupEdits(
      catalog,
      active,
      operation.session,
      new Map()
    );
    const next = selectedSetupSession(
      merged.catalog,
      [1, 2],
      roster,
      merged.edits
    );
    expect(next.draft.content.appointments).toHaveLength(2);
    expect(next.draft.content.appointments[0]).toMatchObject({
      allocations: [
        { fundingSourceId: 1, percent: 0.25 },
        { fundingSourceId: 2, percent: 0.5 },
      ],
      monthlySalary: 12_345,
    });
    const deselected = selectedSetupSession(
      merged.catalog,
      [],
      roster,
      merged.edits
    );
    expect(deselected.draft.content.appointments).toHaveLength(1);
    expect(deselected.draft.content.appointments[0].monthlySalary).toBe(12_345);
  });

  it('does not revive an intentionally removed appointment when funding is reselected', () => {
    const { catalog, roster } = fixture();
    const active = selectedSetupSession(catalog, [1], roster, new Map());
    const removed = removeProjectionAppointment(active, 101);
    if (!removed.ok) {
      throw new Error(removed.error);
    }
    const merged = mergeSetupEdits(catalog, active, removed.session, new Map());
    const restored = selectedSetupSession(
      merged.catalog,
      [1, 2],
      roster,
      merged.edits
    );
    expect(restored.draft.content.appointments.map(({ id }) => id)).toEqual([
      102,
    ]);
  });

  it('reserves unselected appointment IDs when adding a hypothetical hire', () => {
    const { catalog, roster } = fixture();
    const active = selectedSetupSession(catalog, [1], roster, new Map());
    const added = addProjectionAppointment(active, {
      ...catalog.draft.content.appointments[0],
      name: 'New hire',
    });
    if (!added.ok) {
      throw new Error(added.error);
    }
    expect(added.appointmentId).toBe(103);
    const merged = mergeSetupEdits(catalog, active, added.session, new Map());
    expect(
      selectedSetupSession(
        merged.catalog,
        [1, 2],
        roster,
        merged.edits
      ).draft.content.appointments.map(({ id }) => id)
    ).toEqual([101, 102, 103]);
  });
});
