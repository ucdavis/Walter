import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import {
  aggregateByPosition,
  PersonnelTable,
} from '@/components/project/PersonnelTable.tsx';
import { downloadExcelCsv } from '@/lib/csv.ts';
import { formatDate } from '@/lib/date.ts';
import { PersonnelRecord } from '@/queries/personnel.ts';
import { tooltipDefinitions } from '@/shared/tooltips.ts';

vi.mock('@/lib/csv.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/csv.ts')>();

  return {
    ...actual,
    downloadExcelCsv: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.mocked(downloadExcelCsv).mockClear();
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
  isFuture: false,
  jobCode: '001234',
  jobEffectiveDate: '2020-01-01T00:00:00.000Z',
  jobEndDate: null,
  monthlyRate: 5000,
  name: 'Smith, John',
  positionDescription: 'PROF-FY',
  positionNumber: '40001234',
  projectDescription: 'Test Project',
  projectId: 'PROJ1',
  projectType: null,
  task: null,
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

  it('takes position figures from the current entry when a future entry comes first', () => {
    const records = [
      createRecord({ fte: 1, isFuture: true, monthlyRate: 9000 }),
      createRecord({ fte: 0.5, monthlyRate: 4000 }),
    ];

    const [position] = aggregateByPosition(records);

    expect(position.monthlyRate).toBe(2000);
    expect(position.isFutureOnly).toBe(false);
    expect(position.distributions.map((d) => d.record.isFuture)).toEqual([
      false,
      true,
    ]);
  });

  it('marks positions with only future entries', () => {
    const [position] = aggregateByPosition([createRecord({ isFuture: true })]);

    expect(position.isFutureOnly).toBe(true);
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

    expect(
      screen.getByText('Smith, John (1001) - PROF-FY')
    ).toBeInTheDocument();
  });

  it('displays FTE column', () => {
    const records = [createRecord({ fte: 0.75 })];

    render(<PersonnelTable data={records} />);

    expect(screen.getByText('0.75')).toBeInTheDocument();
  });

  it('shows a tooltip on the FTE header', async () => {
    const user = userEvent.setup();
    render(<PersonnelTable data={[createRecord()]} />);

    const fteHeader = screen.getByText('FTE');
    const fteTrigger = fteHeader.parentElement as HTMLElement;

    expect(fteTrigger).toHaveAttribute('data-tooltip-placement', 'bottom');
    expect(fteTrigger).toHaveAttribute('tabIndex', '0');
    expect(fteHeader).toHaveClass('tooltip-label');

    await user.hover(fteTrigger);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      tooltipDefinitions.fte
    );
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

  it('shows ending soon indicator for dates within 3 months', async () => {
    const twoMonthsFromNow = new Date();
    twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);

    const records = [
      createRecord({
        jobEndDate: twoMonthsFromNow.toISOString(),
      }),
    ];

    render(<PersonnelTable data={records} />);

    const trigger = screen.getByText(
      formatDate(twoMonthsFromNow.toISOString(), '')
    );
    fireEvent.focus(trigger);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      tooltipDefinitions.endingWithinThreeMonths
    );
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

  it('shows the Task on internal-project funding entries and a dash otherwise', async () => {
    const user = userEvent.setup();
    const records = [
      createRecord({
        positionNumber: '40001234',
        projectDescription: 'Internal Ops',
        projectId: 'PROJ1',
        projectType: 'Internal',
        task: '441000',
      }),
      createRecord({
        positionNumber: '40001234',
        projectDescription: 'NSF Grant',
        projectId: 'PROJ2',
        projectType: 'Sponsored',
        task: '778100',
      }),
    ];

    render(<PersonnelTable data={records} />);

    await user.click(
      screen.getByRole('cell', { name: 'Smith, John (1001) - PROF-FY' })
    );

    // Internal project surfaces its task; sponsored project hides it behind a dash.
    expect(screen.getByText('441000')).toBeInTheDocument();
    expect(screen.queryByText('778100')).not.toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows a tooltip on the Mo. CBR header', async () => {
    const user = userEvent.setup();
    render(<PersonnelTable data={[createRecord()]} />);

    const label = screen.getByText('Mo. CBR');
    await user.hover(label.parentElement as HTMLElement);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      tooltipDefinitions.monthlyCbr
    );
  });

  it('shows tooltips in the funding distribution subtable', async () => {
    const user = userEvent.setup();
    render(
      <PersonnelTable
        data={[createRecord({ projectDescription: 'Test Project' })]}
      />
    );

    await user.click(
      screen.getByRole('cell', { name: 'Smith, John (1001) - PROF-FY' })
    );

    const distLabel = screen.getByText('Dist %');
    await user.hover(distLabel.parentElement as HTMLElement);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      tooltipDefinitions.distributionPercent
    );

    await user.unhover(distLabel.parentElement as HTMLElement);

    // Two occurrences after expand: outer header and subtable header. Hover
    // the subtable's (last) one.
    const cbrLabels = screen.getAllByText('Mo. CBR');
    await user.hover(
      cbrLabels[cbrLabels.length - 1].parentElement as HTMLElement
    );
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      tooltipDefinitions.monthlyCbr
    );
  });

  it('hides unfilled positions without offering a toggle', () => {
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

    expect(
      screen.getByText('Smith, John (1001) - PROF-FY')
    ).toBeInTheDocument();
    expect(screen.queryByText(/STDT 3/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /unfilled/i })
    ).not.toBeInTheDocument();
  });

  it('does not show the future toggle when no future entries exist', () => {
    render(<PersonnelTable data={[createRecord()]} />);

    expect(
      screen.queryByRole('button', { name: /future entries/i })
    ).not.toBeInTheDocument();
  });

  it('hides future entries by default and shows them when toggled', async () => {
    const user = userEvent.setup();
    const records = [
      createRecord({ projectDescription: 'Current Project' }),
      createRecord({
        fundingEffectiveDate: '2099-01-01T00:00:00.000Z',
        isFuture: true,
        monthlyRate: 9000,
        projectDescription: 'Future Project',
      }),
    ];

    render(<PersonnelTable data={records} />);

    const toggle = screen.getByRole('button', { name: /show future entries/i });
    expect(toggle).toHaveTextContent('Show future entries (1)');

    await user.click(
      screen.getByRole('cell', { name: 'Smith, John (1001) - PROF-FY' })
    );
    expect(screen.getByText('Current Project')).toBeInTheDocument();
    expect(screen.queryByText('Future Project')).not.toBeInTheDocument();

    await user.click(toggle);

    expect(screen.getByText('Future Project')).toBeInTheDocument();
    expect(screen.getByText('Future')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /hide future entries/i })
    ).toBeInTheDocument();
  });

  it('keeps totals on current entries when future entries are shown', async () => {
    const user = userEvent.setup();
    const records = [
      createRecord({ monthlyRate: 5000 }),
      createRecord({
        fundingEffectiveDate: '2099-01-01T00:00:00.000Z',
        isFuture: true,
        monthlyRate: 9000,
      }),
      createRecord({
        employeeId: '1003',
        isFuture: true,
        monthlyRate: 7000,
        name: 'New, Hire',
        positionNumber: '40009999',
      }),
    ];

    render(<PersonnelTable data={records} />);
    await user.click(
      screen.getByRole('button', { name: /show future entries/i })
    );

    expect(screen.getByText(/New, Hire \(1003\)/)).toBeInTheDocument();
    // Footer: only the current 5000 salary and 2000 CBR count.
    const footer = screen.getByText('Totals').closest('tr') as HTMLElement;
    expect(footer).toHaveTextContent('$5,000.00');
    expect(footer).toHaveTextContent('$2,000.00');
    expect(footer).toHaveTextContent('$7,000.00');
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

    expect(
      screen.getByText('Adams, Alice (1001) - PROF-FY')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Baker, Bob (1002) - PROF-FY')
    ).not.toBeInTheDocument();
  });

  it('shows the filtered export action only when a search filter is active', () => {
    const records = [
      createRecord({
        employeeId: '1001',
        name: 'Adams, Alice',
        positionNumber: '40001111',
        projectDescription: 'Sunny Project',
      }),
      createRecord({
        employeeId: '1002',
        name: 'Baker, Bob',
        positionNumber: '40002222',
        projectDescription: 'Rainy Project',
      }),
    ];

    render(<PersonnelTable data={records} />);

    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Export filtered' })
    ).not.toBeInTheDocument();

    fireEvent.input(screen.getByPlaceholderText('Search all columns...'), {
      target: { value: 'Sunny' },
    });

    expect(
      screen.getByRole('button', { name: 'Export filtered' })
    ).toBeInTheDocument();
  });

  it('exports only filtered personnel when the filtered export button is used', () => {
    const records = [
      createRecord({
        employeeId: '1001',
        fundingEffectiveDate: '2024-07-01',
        name: 'Adams, Alice',
        positionNumber: '40001111',
        projectDescription: 'Sunny Project',
      }),
      createRecord({
        employeeId: '1002',
        name: 'Baker, Bob',
        positionNumber: '40002222',
        projectDescription: 'Rainy Project',
      }),
    ];

    render(<PersonnelTable data={records} />);

    fireEvent.input(screen.getByPlaceholderText('Search all columns...'), {
      target: { value: 'Sunny' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Export filtered' }));

    expect(downloadExcelCsv).toHaveBeenCalledTimes(1);

    const csv = vi.mocked(downloadExcelCsv).mock.calls[0]?.[0];
    const filename = vi.mocked(downloadExcelCsv).mock.calls[0]?.[1];

    expect(csv).toContain('Adams, Alice');
    expect(csv).toContain('Sunny Project');
    expect(csv).not.toContain('Baker, Bob');
    expect(csv).not.toContain('Rainy Project');
    expect(csv).toContain('07/01/2024');
    expect(filename).toBe('personnel-filtered.csv');
  });
});
