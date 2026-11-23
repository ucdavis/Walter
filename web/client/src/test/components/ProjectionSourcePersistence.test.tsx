import { createRef, useImperativeHandle } from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ProjectionSessionProvider,
  useProjectionSession,
} from '@/components/projections/ProjectionSession.tsx';
import { createSalaryExample } from '@/test/fixtures/projections.ts';
import { HttpError } from '@/lib/api.ts';
import {
  addProjectionAppointment,
  editProjectionAppointment,
} from '@/lib/projectionAppointments.ts';
import {
  addImportedSources,
  addPlannedSource,
} from '@/lib/projectionSources.ts';
import { isProjectionDirty } from '@/lib/projectionWorkspace.ts';
import type {
  Projection,
  ProjectionFundingSource,
  SaveProjectionRequest,
} from '@/queries/projections.ts';

describe('source changes during persistence', () => {
  it('retains an acknowledged save baseline when an import finishes in the same React batch', async () => {
    const plan = createSalaryExample();
    const version = '2026-04-01T12:00:00.1234567Z';
    const requests: SaveProjectionRequest[] = [];
    const fresh: ProjectionFundingSource = {
      ...structuredClone(plan.content.fundingSources[0]),
      capturedAt: version,
      projectNumber: 'NEW',
      sourceKind: 'Task',
      taskNumber: 'T1',
    };
    const controls = createRef<ReturnType<typeof useProjectionSession>>();
    function Probe() {
      const value = useProjectionSession();
      useImperativeHandle(controls, () => value);
      return <p>{value.session.draft.content.fundingSources.length} sources</p>;
    }
    render(
      <ProjectionSessionProvider
        initialPlan={plan}
        persistence={{
          reload: async () => plan,
          save: async (request) => {
            requests.push(request);
            return {
              ...plan,
              content: request.content,
              name: request.name,
              updatedAt: version,
            };
          },
        }}
      >
        <Probe />
      </ProjectionSessionProvider>
    );
    await act(async () =>
      controls.current!.applyAppointmentOperation((current) =>
        editProjectionAppointment(current, 101, {
          ...current.draft.content.appointments[0],
          monthlySalary: 11_000,
        })
      )
    );
    const actions = controls.current!;
    await act(async () => {
      await actions.save();
      actions.applySourceOperation((current) =>
        addImportedSources(current, [fresh])
      );
    });
    expect(screen.getByText('3 sources')).toBeInTheDocument();
    expect(controls.current!.session.baseline.updatedAt).toBe(version);
    expect(
      controls.current!.session.draft.content.appointments[0].monthlySalary
    ).toBe(11_000);
    expect(isProjectionDirty(controls.current!.session)).toBe(true);
    await act(async () => controls.current!.save());
    expect(requests).toHaveLength(2);
    expect(requests[1].expectedUpdatedAt).toBe(version);
    expect(requests[1].content.fundingSources).toHaveLength(3);
    expect(isProjectionDirty(controls.current!.session)).toBe(false);
  });

  it('pauses hire and source additions while an overwrite can advance both ID counters', async () => {
    const plan = createSalaryExample();
    const controls = createRef<ReturnType<typeof useProjectionSession>>();
    function Probe() {
      const value = useProjectionSession();
      useImperativeHandle(controls, () => value);
      return null;
    }
    let finishOverwrite!: (saved: Projection) => void;
    const response = new Promise<Projection>((resolve) => {
      finishOverwrite = resolve;
    });
    let submitted!: SaveProjectionRequest;
    render(
      <ProjectionSessionProvider
        initialPlan={plan}
        persistence={{
          reload: async () => plan,
          save: (request) => {
            if (!request.overwrite) {
              return Promise.reject(
                new HttpError(409, '/api/projections/1', { code: 'conflict' })
              );
            }
            submitted = request;
            return response;
          },
        }}
      >
        <Probe />
      </ProjectionSessionProvider>
    );
    const actions = () => controls.current!;
    const addHire = () =>
      actions().applyAppointmentOperation((current) =>
        addProjectionAppointment(current, {
          ...plan.content.appointments[0],
          name: 'New hire',
        })
      );
    const addPlanned = () =>
      actions().applySourceOperation((current) =>
        addPlannedSource(current, {
          balance: 100,
          endDate: null,
          initialCategoryBudgets: [],
          name: 'New pool',
          plannedBudgetMode: 'GeneralPool',
          startDate: '2026-01-01',
        })
      );
    const addImported = () =>
      actions().applySourceOperation((current) =>
        addImportedSources(current, [
          { ...plan.content.fundingSources[0], projectNumber: 'NEW' },
        ])
      );
    const editSalary = (monthlySalary: number) =>
      actions().applyAppointmentOperation((current) =>
        editProjectionAppointment(current, 101, {
          ...current.draft.content.appointments[0],
          monthlySalary,
        })
      );
    act(() => {
      editSalary(11_000);
    });
    await act(async () => actions().save());
    let pending!: Promise<void>;
    act(() => {
      pending = actions().overwrite();
    });
    act(() => {
      expect(addHire()).toMatchObject({ ok: false });
      expect(addPlanned()).toMatchObject({ ok: false });
      expect(addImported()).toMatchObject({ ok: false });
      expect(editSalary(12_000)).toMatchObject({ ok: true });
    });
    expect(actions().session.draft.content).toMatchObject({
      lastAppointmentId: 101,
      lastFundingSourceId: 2,
    });
    await act(async () => {
      finishOverwrite({
        ...plan,
        content: {
          ...submitted.content,
          lastAppointmentId: 102,
          lastFundingSourceId: 3,
        },
        updatedAt: '2026-04-01T12:00:00.1234567Z',
      });
      await pending;
    });
    expect(actions().session.draft.content.appointments[0].monthlySalary).toBe(
      12_000
    );
    act(() => {
      expect(addHire()).toMatchObject({ appointmentId: 103, ok: true });
      expect(addPlanned()).toMatchObject({ fundingSourceId: 4, ok: true });
      expect(addImported()).toMatchObject({ fundingSourceId: 5, ok: true });
    });
  });
});
