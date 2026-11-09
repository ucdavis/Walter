import { createRef, useImperativeHandle } from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ProjectionSessionProvider,
  useProjectionSession,
} from '@/components/projections/ProjectionSession.tsx';
import { createSalaryExample } from '@/dev/projections/fixture.ts';
import { editProjectionAppointment } from '@/lib/projectionAppointments.ts';
import { addImportedSources } from '@/lib/projectionSources.ts';
import { isProjectionDirty } from '@/lib/projectionWorkspace.ts';
import type {
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
});
