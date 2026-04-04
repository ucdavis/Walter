import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import {
  aggregateByPosition,
  PersonnelTable,
} from '@/components/project/PersonnelTable.tsx';
import { PersonnelRecord } from '@/queries/personnel.ts';
import { tooltipDefinitions } from '@/shared/tooltips.ts';

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
});

const createRecord = (
  overrides: Partial<PersonnelRecord> = {}
): PersonnelRecord => ({
  compositeBenefitRate: 0.4,
  distributionPercent: 100,
  employeeId: '1001',
  fte: 1.0,
  fundingEffectiveDate: '2025-07-01T00:00:00.000Z',
  fundingEndDate: '2026-12-31T00:00:00.000Z',
  jobEffectiveDate: '2020-01-01T00:00:00.000Z',
  jobEndDate: null,
  monthlyRate: 5000,
  name: 'Smith, John',
  positionDescription: 'PROF-FY',
  positionNumber: '40001234',
  projectDescription: 'Test Project',
  projectId: 'PROJ1',
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

  it('calculates actual salaries using FTE', () => {
    // monthlyRate from API is the 1.0 FTE rate; actual salary = monthlyRate * fte
    const records = [
      createRecord({
        compositeBenefitRate: 0.4,
        distributionPercent: 60,
        fte: 0.5,
        monthlyRate: 4000,
        positionNumber: '40001234',
        projectId: 'PROJ1',
      }),
      createRecord({
        compositeBenefitRate: 0.4,
        distributionPercent: 40,
        fte: 0.5,
        monthlyRate: 4000,
        positionNumber: '40001234',
        projectId: 'PROJ2',
      }),
    ];

    const [position] = aggregateByPosition(records);

    // Position level: actual salary = 4000 * 0.5 = 2000
    expect(position.monthlyRate).toBe(2000);
    expect(position.monthlyFringe).toBe(800); // 2000 * 0.4
    expect(position.monthlyTotal).toBe(2800);

    // Distribution level: actual salary * dist %
    const [dist1, dist2] = position.distributions;
    // 4000 * 0.5 * 60% = 1200
    expect(dist1.monthlyRate).toBe(1200);
    expect(dist1.monthlyFringe).toBeCloseTo(480); // 1200 * 0.4
    expect(dist1.monthlyTotal).toBeCloseTo(1680);
    // 4000 * 0.5 * 40% = 800
    expect(dist2.monthlyRate).toBe(800);
    expect(dist2.monthlyFringe).toBeCloseTo(320); // 800 * 0.4
    expect(dist2.monthlyTotal).toBeCloseTo(1120);
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

    expect(screen.getByText('Smith, John (1001) - PROF-FY')).toBeInTheDocument();
  });

  it('displays FTE column', () => {
    const records = [createRecord({ fte: 0.75 })];

    render(<PersonnelTable data={records} />);

    expect(screen.getByText('0.75')).toBeInTheDocument();
  });

  it('opens a drawer from the FTE header', async () => {
    const user = userEvent.setup();
    render(<PersonnelTable data={[createRecord()]} />);

    const fteHeader = screen.getByRole('columnheader', { name: /fte/i });
    const fteTrigger = screen.getByRole('button', { name: 'Open FTE help' });

    expect(fteHeader).toBeInTheDocument();
    expect(fteTrigger).toHaveAttribute('aria-haspopup', 'dialog');

    await user.click(fteTrigger);

    expect(await screen.findByRole('dialog', { name: 'FTE' })).toHaveTextContent(
      tooltipDefinitions.fte
    );
  });

  it('keeps sorting behavior on the FTE header text', async () => {
    const user = userEvent.setup();
    render(<PersonnelTable data={[createRecord({ fte: 0.5 }), createRecord({ fte: 1 })]} />);

    const fteHeader = screen.getByRole('columnheader', { name: /fte/i });

    await user.click(fteHeader);

    expect(screen.queryByRole('dialog', { name: 'FTE' })).not.toBeInTheDocument();
    expect(within(fteHeader).getByLabelText(/sorted/i)).toBeInTheDocument();
  });

  it('displays totals in footer', () => {
    const records = [
      createRecord({
        compositeBenefitRate: 0.4,
        employeeId: '1001',
        monthlyRate: 5000,
        positionNumber: '40001234',
      }), // monthly: 5000, fringe: 2000
      createRecord({
        compositeBenefitRate: 0.4,
        employeeId: '1002',
        monthlyRate: 4000,
        name: 'Doe, Jane',
        positionNumber: '40005678',
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

  it('renders an expanded distributions subtable with headers', async () => {
    const user = userEvent.setup();
    const records = [createRecord({ projectDescription: 'Test Project' })];

    render(<PersonnelTable data={records} />);

    expect(screen.queryByText('Project')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('cell', { name: 'Smith, John (1001) - PROF-FY' })
    );

    expect(screen.getByText('Project')).toBeInTheDocument();
    expect(screen.getByText('Test Project')).toBeInTheDocument();
  });

  it('opens a drawer from the Monthly CBR header', async () => {
    const user = userEvent.setup();
    render(<PersonnelTable data={[createRecord()]} />);

    await user.click(screen.getByRole('button', { name: 'Open Monthly CBR help' }));

    expect(await screen.findByRole('dialog', { name: 'Monthly CBR' })).toHaveTextContent(
      tooltipDefinitions.monthlyCbr
    );
  });

  it('opens drawers in the funding distribution subtable', async () => {
    const user = userEvent.setup();
    render(<PersonnelTable data={[createRecord({ projectDescription: 'Test Project' })]} />);

    await user.click(
      screen.getByRole('cell', { name: 'Smith, John (1001) - PROF-FY' })
    );

    await user.click(screen.getByRole('button', { name: 'Dist %' }));
    expect(await screen.findByRole('dialog', { name: 'Dist %' })).toHaveTextContent(
      tooltipDefinitions.distributionPercent
    );

    await user.click(screen.getByRole('button', { name: 'Close Dist % help' }));

    await user.click(screen.getByRole('button', { name: 'CBR' }));
    expect(await screen.findByRole('dialog', { name: 'CBR' })).toHaveTextContent(
      tooltipDefinitions.cbr
    );
  });

  it('hides unfilled positions by default', () => {
    const records = [
      createRecord({ name: 'Smith, John', positionNumber: '40001234' }),
      createRecord({
        employeeId: '',
        name: '',
        positionDescription: 'STDT 3',
        positionNumber: '40005678',
      }),
    ];

    render(<PersonnelTable data={records} />);

    expect(screen.getByText('Smith, John (1001) - PROF-FY')).toBeInTheDocument();
    expect(screen.queryByText(/STDT 3/)).not.toBeInTheDocument();
  });

  it('shows unfilled positions when toggle is clicked', async () => {
    const user = userEvent.setup();
    const records = [
      createRecord({ name: 'Smith, John', positionNumber: '40001234' }),
      createRecord({
        employeeId: '',
        name: '',
        positionDescription: 'STDT 3',
        positionNumber: '40005678',
      }),
    ];

    render(<PersonnelTable data={records} />);

    const toggle = screen.getByRole('button', { name: /show unfilled/i });
    expect(toggle).toHaveTextContent('Show unfilled (1)');

    await user.click(toggle);

    expect(screen.getByText(/STDT 3/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /hide unfilled/i })
    ).toBeInTheDocument();
  });

  it('does not show unfilled toggle when no unfilled positions exist', () => {
    const records = [createRecord({ name: 'Smith, John' })];

    render(<PersonnelTable data={records} />);

    expect(
      screen.queryByRole('button', { name: /unfilled/i })
    ).not.toBeInTheDocument();
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

    expect(screen.getByText('Adams, Alice (1001) - PROF-FY')).toBeInTheDocument();
    expect(screen.queryByText('Baker, Bob (1002) - PROF-FY')).not.toBeInTheDocument();
  });
});
