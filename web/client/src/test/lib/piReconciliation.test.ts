import { describe, expect, it } from 'vitest';
import {
  buildPiProjects,
  chunk,
  getPmInternalProjects,
} from '@/lib/piReconciliation.ts';
import {
  createProjectRecord,
  createReconciliationRecord,
} from '@/test/projectFixtures.ts';

describe('getPmInternalProjects', () => {
  it('keeps only internal projects managed by the PM', () => {
    const result = getPmInternalProjects(
      [
        createProjectRecord({ pmEmployeeId: '1000', projectNumber: 'P1' }),
        createProjectRecord({ pmEmployeeId: '9999', projectNumber: 'P2' }),
        createProjectRecord({
          pmEmployeeId: '1000',
          projectNumber: 'S1',
          projectType: 'Sponsored',
        }),
      ],
      '1000'
    );

    expect(result).toEqual([
      { projectName: 'Internal Project', projectNumber: 'P1' },
    ]);
  });

  it('dedupes task rows into one project', () => {
    const result = getPmInternalProjects(
      [
        createProjectRecord({ taskNum: 'T001' }),
        createProjectRecord({ taskNum: 'T002' }),
      ],
      '1000'
    );

    expect(result).toHaveLength(1);
  });

  it('keeps projects whose tasks are all inactive', () => {
    const result = getPmInternalProjects(
      [createProjectRecord({ taskStatus: 'Inactive' })],
      '1000'
    );

    expect(result.map((p) => p.projectNumber)).toEqual(['P1']);
  });

  it('tolerates a project with no name', () => {
    const result = getPmInternalProjects(
      [
        createProjectRecord({ projectName: 'Beta', projectNumber: 'P2' }),
        createProjectRecord({
          projectName: null as unknown as string,
          projectNumber: 'P1',
        }),
      ],
      '1000'
    );

    expect(result).toEqual([
      { projectName: '', projectNumber: 'P1' },
      { projectName: 'Beta', projectNumber: 'P2' },
    ]);
  });

  it('sorts projects by name then number', () => {
    const result = getPmInternalProjects(
      [
        createProjectRecord({ projectName: 'Zeta', projectNumber: 'P3' }),
        createProjectRecord({ projectName: 'Alpha', projectNumber: 'P2' }),
        createProjectRecord({ projectName: 'Alpha', projectNumber: 'P1' }),
      ],
      '1000'
    );

    expect(result.map((p) => p.projectNumber)).toEqual(['P1', 'P2', 'P3']);
  });
});

describe('chunk', () => {
  it('splits into batches of the given size', () => {
    const items = Array.from({ length: 250 }, (_, i) => i);

    expect(chunk(items, 100).map((batch) => batch.length)).toEqual([
      100, 100, 50,
    ]);
    expect(chunk([], 100)).toEqual([]);
  });
});

describe('buildPiProjects', () => {
  it('flags out-of-balance projects', () => {
    const recordsByProject = new Map([
      [
        'P1',
        [
          createReconciliationRecord({
            glActualAmount: -100,
            ppmBudBal: 0,
            project: 'P1',
          }),
        ],
      ],
      ['P2', [createReconciliationRecord({ project: 'P2' })]],
    ]);

    const result = buildPiProjects(
      [
        { projectName: 'One', projectNumber: 'P1' },
        { projectName: 'Two', projectNumber: 'P2' },
        { projectName: 'Three', projectNumber: 'P3' },
      ],
      recordsByProject
    );

    expect(
      result.map((p) => [p.projectNumber, p.isOutOfBalance, p.records.length])
    ).toEqual([
      ['P1', true, 1],
      ['P2', false, 1],
      ['P3', false, 0],
    ]);
  });
});
