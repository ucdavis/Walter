import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  aggregateByEmployee,
  PersonnelTable,
} from '@/components/project/PersonnelTable.tsx';
import { PersonnelRecord } from '@/queries/personnel.ts';

const createRecord = (
  overrides: Partial<PersonnelRecord> = {}
): PersonnelRecord => ({
  cbr: 0.4,
  distPct: 100,
  emplid: '1001',
  fte: 1.0,
  fundingEndDt: '2026-12-31T00:00:00.000Z',
  monthlyRt: 5000,
  name: 'Smith,John',
  positionDescr: 'PROF-FY',
  projectId: 'PROJ1',
  projectName: 'Test Project',
  ...overrides,
});

describe('aggregateByEmployee', () => {
  it('groups records by employee ID', () => {
    const records = [
      createRecord({ emplid: '1001', name: 'Smith,John', projectId: 'PROJ1' }),
      createRecord({ emplid: '1001', name: 'Smith,John', projectId: 'PROJ2' }),
      createRecord({ emplid: '1002', name: 'Doe,Jane', projectId: 'PROJ1' }),
    ];

    const result = aggregateByEmployee(records);

    expect(result).toHaveLength(2);
    expect(result.find((e) => e.emplid === '1001')?.positions).toHaveLength(2);
    expect(result.find((e) => e.emplid === '1002')?.positions).toHaveLength(1);
  });

  it('calculates totals correctly across positions', () => {
    const records = [
      createRecord({ emplid: '1001', monthlyRt: 5000, cbr: 0.4 }), // annual: 60000, fringe: 24000
      createRecord({ emplid: '1001', monthlyRt: 3000, cbr: 0.4 }), // annual: 36000, fringe: 14400
    ];

    const result = aggregateByEmployee(records);
    const employee = result[0];

    expect(employee.totalAnnualSalary).toBe(96000); // 60000 + 36000
    expect(employee.totalFringeAmount).toBe(38400); // 24000 + 14400
  });

  it('sets primary position to first record', () => {
    const records = [
      createRecord({
        emplid: '1001',
        positionDescr: 'FIRST POSITION',
        distPct: 30,
      }),
      createRecord({
        emplid: '1001',
        positionDescr: 'SECOND POSITION',
        distPct: 70,
      }),
    ];

    const result = aggregateByEmployee(records);

    expect(result[0].primaryPosition.positionDescr).toBe('FIRST POSITION');
  });

  it('counts unique projects correctly', () => {
    const records = [
      createRecord({ emplid: '1001', projectId: 'PROJ1' }),
      createRecord({ emplid: '1001', projectId: 'PROJ1' }), // same project
      createRecord({ emplid: '1001', projectId: 'PROJ2' }),
    ];

    const result = aggregateByEmployee(records);

    expect(result[0].projectCount).toBe(2);
  });
});

describe('PersonnelTable', () => {
  it('shows (+N) indicator only when multiple unique job titles exist', async () => {
    // Employee with same job title twice - should NOT show indicator
    const sameTitle = [
      createRecord({
        emplid: '1001',
        name: 'Smith,John',
        positionDescr: 'PROF-FY',
        projectId: 'PROJ1',
      }),
      createRecord({
        emplid: '1001',
        name: 'Smith,John',
        positionDescr: 'PROF-FY',
        projectId: 'PROJ2',
      }),
    ];

    const { unmount } = render(<PersonnelTable data={sameTitle} />);
    expect(screen.queryByText(/\(\+\d+\)/)).not.toBeInTheDocument();
    unmount();

    // Employee with different job titles - should show indicator
    const diffTitles = [
      createRecord({
        emplid: '1001',
        name: 'Smith,John',
        positionDescr: 'PROF-FY',
        projectId: 'PROJ1',
      }),
      createRecord({
        emplid: '1001',
        name: 'Smith,John',
        positionDescr: 'POSTDOC-EMPLOYEE',
        projectId: 'PROJ2',
      }),
    ];

    render(<PersonnelTable data={diffTitles} />);
    expect(screen.getByText('(+1)')).toBeInTheDocument();
  });

  it('displays totals in footer', () => {
    const records = [
      createRecord({ emplid: '1001', monthlyRt: 5000, cbr: 0.4 }), // salary: 60000, fringe: 24000
      createRecord({ emplid: '1002', name: 'Doe,Jane', monthlyRt: 4000, cbr: 0.4 }), // salary: 48000, fringe: 19200
    ];

    render(<PersonnelTable data={records} />);

    // Total salary: 60000 + 48000 = 108000
    expect(screen.getByText('$108,000.00')).toBeInTheDocument();
    // Total fringe: 24000 + 19200 = 43200
    expect(screen.getByText('$43,200.00')).toBeInTheDocument();
    // Grand total: 108000 + 43200 = 151200
    expect(screen.getByText('$151,200.00')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    render(<PersonnelTable data={[]} />);
    expect(screen.getByText('No personnel found.')).toBeInTheDocument();
  });

  it('renders only filtered data when passed filtered records', () => {
    // Simulate what project detail page does - filter by projectId
    const allPersonnel = [
      createRecord({
        emplid: '1001',
        name: 'Adams,Alice',
        projectId: 'PROJ1',
      }),
      createRecord({
        emplid: '1002',
        name: 'Baker,Bob',
        projectId: 'PROJ2',
      }),
    ];

    // Filter to only PROJ1
    const filtered = allPersonnel.filter((p) => p.projectId === 'PROJ1');

    render(<PersonnelTable data={filtered} />);

    expect(screen.getByText('Adams,Alice')).toBeInTheDocument();
    expect(screen.queryByText('Baker,Bob')).not.toBeInTheDocument();
  });
});