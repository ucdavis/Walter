import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  aggregateByPosition,
  PersonnelTable,
} from '@/components/project/PersonnelTable.tsx';
import { PersonnelRecord } from '@/queries/personnel.ts';

const createRecord = (
  overrides: Partial<PersonnelRecord> = {}
): PersonnelRecord => ({
  compositeBenefitRate: 0.4,
  distributionPercent: 100,
  employeeId: '1001',
  fte: 1.0,
  fundingEffectiveDate: '2025-07-01T00:00:00.000Z',
  fundingEndDate: '2026-12-31T00:00:00.000Z',
  positionEffectiveDate: '2020-01-01T00:00:00.000Z',
  jobEndDate: null,
  monthlyRate: 5000,
  name: 'Smith, John',
  positionDescription: 'PROF-FY',
  positionNumber: '40001234',
  projectId: 'PROJ1',
  projectDescription: 'Test Project',
  ...overrides,
});

describe('aggregateByPosition', () => {
  it('groups records by employee + position number', () => {
    const records = [
      createRecord({
        employeeId: '1001',
        positionNumber: '40001234',
        projectId: 'PROJ1',
      }),
      createRecord({
        employeeId: '1001',
        positionNumber: '40001234',
        projectId: 'PROJ2',
      }), // same position, diff project
      createRecord({
        employeeId: '1001',
        positionNumber: '40005678',
        projectId: 'PROJ1',
      }), // diff position
    ];

    const result = aggregateByPosition(records);

    expect(result).toHaveLength(2);
    const pos1 = result.find((p) => p.positionNumber === '40001234');
    const pos2 = result.find((p) => p.positionNumber === '40005678');
    expect(pos1?.distributions).toHaveLength(2);
    expect(pos2?.distributions).toHaveLength(1);
  });

  it('separates same position number for different employees', () => {
    const records = [
      createRecord({ employeeId: '1001', positionNumber: '40001234' }),
      createRecord({
        employeeId: '1002',
        name: 'Doe, Jane',
        positionNumber: '40001234',
      }),
    ];

    const result = aggregateByPosition(records);

    expect(result).toHaveLength(2);
  });
});

describe('PersonnelTable', () => {
  it('displays name and position in combined format', () => {
    const records = [
      createRecord({ name: 'Smith, John', positionDescription: 'PROF-FY' }),
    ];

    render(<PersonnelTable data={records} />);

    expect(screen.getByText('Smith, John - PROF-FY')).toBeInTheDocument();
  });

  it('displays FTE column', () => {
    const records = [createRecord({ fte: 0.75 })];

    render(<PersonnelTable data={records} />);

    expect(screen.getByText('0.75')).toBeInTheDocument();
  });

  it('displays totals in footer', () => {
    const records = [
      createRecord({
        employeeId: '1001',
        positionNumber: '40001234',
        monthlyRate: 5000,
        compositeBenefitRate: 0.4,
      }), // monthly: 5000, fringe: 2000
      createRecord({
        employeeId: '1002',
        name: 'Doe, Jane',
        positionNumber: '40005678',
        monthlyRate: 4000,
        compositeBenefitRate: 0.4,
      }), // monthly: 4000, fringe: 1600
    ];

    render(<PersonnelTable data={records} />);

    // Total monthly rate: 5000 + 4000 = 9000
    expect(screen.getByText('$9,000.00')).toBeInTheDocument();
    // Total monthly fringe: 2000 + 1600 = 3600
    expect(screen.getByText('$3,600.00')).toBeInTheDocument();
    // Monthly total: 9000 + 3600 = 12600
    expect(screen.getByText('$12,600.00')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    render(<PersonnelTable data={[]} />);
    expect(screen.getByText('No personnel found.')).toBeInTheDocument();
  });

  it('shows ending soon indicator for dates within 3 months', () => {
    const twoMonthsFromNow = new Date();
    twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);

    const records = [
      createRecord({
        jobEndDate: twoMonthsFromNow.toISOString(),
      }),
    ];

    render(<PersonnelTable data={records} />);

    expect(screen.getByTitle('Ending within 3 months')).toBeInTheDocument();
  });

  it('renders only filtered data when passed filtered records', () => {
    const allPersonnel = [
      createRecord({
        employeeId: '1001',
        name: 'Adams, Alice',
        positionNumber: '40001111',
        projectId: 'PROJ1',
      }),
      createRecord({
        employeeId: '1002',
        name: 'Baker, Bob',
        positionNumber: '40002222',
        projectId: 'PROJ2',
      }),
    ];

    // Filter to only PROJ1
    const filtered = allPersonnel.filter((p) => p.projectId === 'PROJ1');

    render(<PersonnelTable data={filtered} />);

    expect(screen.getByText('Adams, Alice - PROF-FY')).toBeInTheDocument();
    expect(screen.queryByText('Baker, Bob - PROF-FY')).not.toBeInTheDocument();
  });
});
