import { describe, expect, it } from 'vitest';
import {
  createProjectBurndown,
  type ProjectBurndownPoint,
} from '@/lib/projectBurndown.ts';
import type { PersonnelRecord } from '@/queries/personnel.ts';

const createRecord = (
  overrides: Partial<PersonnelRecord> = {}
): PersonnelRecord => ({
  compositeBenefitRate: 0.4,
  distributionPercent: 50,
  employeeId: '1001',
  fte: 1,
  fundingEffectiveDate: '2026-01-01',
  fundingEndDate: null,
  jobCode: '001234',
  jobEffectiveDate: '2025-01-01',
  jobEndDate: null,
  monthlyRate: 10_000,
  name: 'Smith, Jane',
  positionDescription: 'Researcher',
  positionNumber: '40001234',
  projectDescription: 'Test Project',
  projectId: 'P1',
  ...overrides,
});

const pointByLabel = (points: ProjectBurndownPoint[], label: string) => {
  const point = points.find((candidate) => candidate.label === label);
  expect(point).toBeDefined();
  return point as ProjectBurndownPoint;
};

describe('createProjectBurndown', () => {
  it('starts with the current balance before subtracting projected cost', () => {
    const points = createProjectBurndown({
      personnel: [createRecord()],
      projectEndDate: null,
      startDate: '2026-05-22',
      startingBalance: 100_000,
    });

    expect(points[0]).toMatchObject({
      isStartingBalance: true,
      label: 'Start',
      remainingBalance: 100_000,
      totalSpend: 0,
    });
    expect(points[1]).toMatchObject({
      label: 'Jun 2026',
      remainingBalance: 93_000,
      totalSpend: 7000,
    });
  });

  it('uses the default 12-month horizon when no project end date exists', () => {
    const points = createProjectBurndown({
      personnel: [],
      projectEndDate: null,
      startDate: '2026-05-22',
      startingBalance: 100_000,
    });

    expect(points).toHaveLength(13);
    expect(points.at(-1)?.label).toBe('May 2027');
  });

  it('caps the projection at the project end month', () => {
    const points = createProjectBurndown({
      personnel: [],
      projectEndDate: '2026-07-15',
      startDate: '2026-05-22',
      startingBalance: 100_000,
    });

    expect(points.map((point) => point.label)).toEqual([
      'Start',
      'Jun 2026',
      'Jul 2026',
    ]);
  });

  it('counts future-dated funding only once the month overlaps', () => {
    const points = createProjectBurndown({
      personnel: [
        createRecord({
          fundingEffectiveDate: '2026-07-20',
        }),
      ],
      projectEndDate: '2026-08-31',
      startDate: '2026-05-22',
      startingBalance: 100_000,
    });

    expect(pointByLabel(points, 'Jun 2026').totalSpend).toBe(0);
    expect(pointByLabel(points, 'Jul 2026').totalSpend).toBe(7000);
  });

  it('counts a partial-month funding end as a full projected month', () => {
    const points = createProjectBurndown({
      personnel: [
        createRecord({
          fundingEndDate: '2026-06-10',
        }),
      ],
      projectEndDate: '2026-07-31',
      startDate: '2026-05-22',
      startingBalance: 100_000,
    });

    expect(pointByLabel(points, 'Jun 2026').totalSpend).toBe(7000);
    expect(pointByLabel(points, 'Jul 2026').totalSpend).toBe(0);
  });

  it('stops personnel cost after the job window ends', () => {
    const points = createProjectBurndown({
      personnel: [
        createRecord({
          jobEndDate: '2026-06-30',
        }),
      ],
      projectEndDate: '2026-07-31',
      startDate: '2026-05-22',
      startingBalance: 100_000,
    });

    expect(pointByLabel(points, 'Jun 2026').totalSpend).toBe(7000);
    expect(pointByLabel(points, 'Jul 2026').totalSpend).toBe(0);
  });

  it('includes active funded open positions', () => {
    const points = createProjectBurndown({
      personnel: [
        createRecord({
          employeeId: '',
          name: '',
          positionDescription: 'Open Analyst',
        }),
      ],
      projectEndDate: '2026-06-30',
      startDate: '2026-05-22',
      startingBalance: 100_000,
    });

    const june = pointByLabel(points, 'Jun 2026');

    expect(june.totalSpend).toBe(7000);
    expect(june.personnel[0].label).toBe('Open position - Open Analyst');
  });

  it('continues below zero instead of clamping projected balance', () => {
    const points = createProjectBurndown({
      personnel: [createRecord()],
      projectEndDate: '2026-06-30',
      startDate: '2026-05-22',
      startingBalance: 5000,
    });

    expect(pointByLabel(points, 'Jun 2026').remainingBalance).toBe(-2000);
  });
});
