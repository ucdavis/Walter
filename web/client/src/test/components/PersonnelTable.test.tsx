import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
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
  earnCode: null,
  earnCodeShare: null,
  earnCodeStatus: null,
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

  it('applies the earn code share to line salary but not position salary', () => {
    const records = [
      createRecord({
        distributionPercent: 100,
        earnCode: 'REG',
        earnCodeShare: 0.8,
        earnCodeStatus: 'Split',
        fte: 0.5,
        monthlyRate: 10_000,
        projectId: 'PROJ1',
      }),
      createRecord({
        distributionPercent: 50,
        earnCode: 'NNC',
        earnCodeShare: 0.2,
        earnCodeStatus: 'Split',
        fte: 0.5,
        monthlyRate: 10_000,
        projectId: 'PROJ2',
      }),
    ];

    const [position] = aggregateByPosition(records);

    // Position salary is the whole job: 10_000 * 0.5
    expect(position.monthlyRate).toBe(5000);
    // REG line: 10000 * 0.8 * 0.5 * 100%
    expect(position.distributions[0].monthlyRate).toBeCloseTo(4000);
    // NNC line: 10000 * 0.2 * 0.5 * 50%
    expect(position.distributions[1].monthlyRate).toBeCloseTo(500);
  });

  it('treats a missing earn code share as 1', () => {
    const [position] = aggregateByPosition([
      createRecord({ distributionPercent: 50, fte: 1, monthlyRate: 4000 }),
    ]);

    expect(position.distributions[0].monthlyRate).toBe(2000);
  });

  it('merges earn code lines on the same funding entry into one total', () => {
    const records = [
      createRecord({
        compositeBenefitRate: 0.4,
        distributionPercent: 100,
        earnCode: 'REG',
        earnCodeShare: 0.8,
        earnCodeStatus: 'Split',
        fte: 0.5,
        monthlyRate: 10_000,
      }),
      createRecord({
        compositeBenefitRate: 0.4,
        distributionPercent: 50,
        earnCode: 'NNC',
        earnCodeShare: 0.2,
        earnCodeStatus: 'Split',
        fte: 0.5,
        monthlyRate: 10_000,
      }),
    ];

    const [position] = aggregateByPosition(records);

    expect(position.distributions).toHaveLength(1);
    const [dist] = position.distributions;
    // 0.8 * 100% + 0.2 * 50%
    expect(dist.distributionPercent).toBeCloseTo(90);
    // REG 4000 + NNC 500
    expect(dist.monthlyRate).toBeCloseTo(4500);
    expect(dist.monthlyFringe).toBeCloseTo(1800);
    expect(dist.monthlyTotal).toBeCloseTo(6300);
  });

  it('keeps funding entries with different dates or tasks as separate rows', () => {
    const records = [
      createRecord({ earnCode: 'REG', task: 'T1' }),
      createRecord({ earnCode: 'NNC', task: 'T2' }),
      createRecord({
        earnCode: 'REG',
        fundingEffectiveDate: '2026-01-01T00:00:00.000Z',
        task: 'T1',
      }),
      createRecord({ earnCode: 'NNC', isFuture: true, task: 'T1' }),
    ];

    const [position] = aggregateByPosition(records);

    expect(position.distributions).toHaveLength(4);
  });

  it('marks unsplit positions and their lines as salary unknown', () => {
    const [position] = aggregateByPosition([
      createRecord({ earnCodeShare: null, earnCodeStatus: 'Unsplit' }),
    ]);

    expect(position.salaryUnknown).toBe(true);
    expect(position.distributions[0].salaryUnknown).toBe(true);
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
  it('shows only PI-distributed amounts in the summary and expanded details', async () => {
    const user = userEvent.setup();
    render(
      <PersonnelTable data={[createRecord({ distributionPercent: 60 })]} />
    );
    const card = screen.getByRole('article', { name: 'Smith, John' });
    expect(within(card).getByText('$3,000.00')).toBeInTheDocument();
    expect(within(card).getByText('$1,200.00')).toBeInTheDocument();
    expect(within(card).getByText('$4,200.00')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    const trigger = within(card).getByRole('button');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(within(card).getByRole('table')).toBeInTheDocument();
    expect(within(card).getByText('Test Project')).toBeInTheDocument();
    for (const fullJobAmount of ['$5,000.00', '$2,000.00', '$7,000.00']) {
      expect(screen.queryByText(fullJobAmount)).not.toBeInTheDocument();
    }
    await user.click(trigger);
    expect(within(card).queryByRole('table')).not.toBeInTheDocument();
  });

  it('groups multiple positions under one employee and sums their PI funding', async () => {
    const user = userEvent.setup();
    render(
      <PersonnelTable
        data={[
          createRecord({ distributionPercent: 40 }),
          createRecord({
            distributionPercent: 50,
            fte: 0.5,
            monthlyRate: 4000,
            positionDescription: 'ASSOC PROF-FY',
            positionNumber: '40005678',
            projectId: 'PROJ2',
          }),
        ]}
      />
    );
    expect(screen.getAllByRole('article')).toHaveLength(1);
    const card = screen.getByRole('article', { name: 'Smith, John' });
    expect(within(card).getByText('2 projects')).toBeInTheDocument();
    expect(within(card).getByText('$3,000.00')).toBeInTheDocument();
    expect(within(card).getByText('$1,200.00')).toBeInTheDocument();
    expect(within(card).getByText('$4,200.00')).toBeInTheDocument();
    await user.click(within(card).getByRole('button'));
    expect(within(card).getByText('PROF-FY · 001234')).toBeInTheDocument();
    expect(
      within(card).getByText('ASSOC PROF-FY · 001234')
    ).toBeInTheDocument();
  });

  it('counts distinct projects rather than funding entries', () => {
    render(
      <PersonnelTable
        data={[
          createRecord(),
          createRecord({ fundingEffectiveDate: '2026-01-01' }),
        ]}
      />
    );
    const card = screen.getByRole('article', { name: 'Smith, John' });
    expect(within(card).getByText('1 project')).toBeInTheDocument();
  });

  it('totals only the current PI distributions across employees', () => {
    render(
      <PersonnelTable
        data={[
          createRecord({ distributionPercent: 60 }),
          createRecord({
            distributionPercent: 50,
            employeeId: '1002',
            monthlyRate: 4000,
            name: 'Doe, Jane',
          }),
        ]}
      />
    );
    const totals = screen.getByRole('region', { name: 'PI funding totals' });
    expect(within(totals).getByText('$5,000.00')).toBeInTheDocument();
    expect(within(totals).getByText('$2,000.00')).toBeInTheDocument();
    expect(within(totals).getByText('$7,000.00')).toBeInTheDocument();
    expect(screen.queryByText('$9,000.00')).not.toBeInTheDocument();
  });

  it('shows unavailable funding as dashes rather than full job salary or zero', async () => {
    const user = userEvent.setup();
    render(
      <PersonnelTable
        data={[createRecord({ earnCodeStatus: 'Unsplit', monthlyRate: 4321 })]}
      />
    );
    const card = screen.getByRole('article', { name: 'Smith, John' });
    expect(within(card).getAllByText('—')).toHaveLength(3);
    expect(within(card).getByText('Funding unavailable')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Totals include known current funding only.'
    );
    await user.click(within(card).getByRole('button'));
    expect(
      within(card).getByText('Funding entry info not available')
    ).toBeInTheDocument();
    expect(screen.queryByText('$4,321.00')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/unsplit/i);
  });

  it('keeps known funding in partial employee totals and identifies missing amounts', () => {
    render(
      <PersonnelTable
        data={[
          createRecord({ distributionPercent: 60 }),
          createRecord({
            earnCodeStatus: 'Unsplit',
            monthlyRate: 4321,
            projectId: 'PROJ2',
          }),
        ]}
      />
    );
    const card = screen.getByRole('article', { name: 'Smith, John' });
    expect(within(card).getByText('Partial funding')).toBeInTheDocument();
    expect(within(card).getByText('$3,000.00')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'not available for 1 entry'
    );
    expect(screen.queryByText('$4,321.00')).not.toBeInTheDocument();
  });

  it('keeps current totals unchanged when future funding is shown', async () => {
    const user = userEvent.setup();
    render(
      <PersonnelTable
        data={[
          createRecord(),
          createRecord({
            isFuture: true,
            monthlyRate: 9000,
            projectDescription: 'Future Project',
          }),
          createRecord({
            employeeId: '1003',
            isFuture: true,
            monthlyRate: 8000,
            name: 'New, Hire',
          }),
        ]}
      />
    );
    expect(
      screen.queryByRole('article', { name: 'New, Hire' })
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /show future entries/i })
    );
    const totals = screen.getByRole('region', { name: 'PI funding totals' });
    expect(within(totals).getByText('$5,000.00')).toBeInTheDocument();
    expect(within(totals).getByText('$2,000.00')).toBeInTheDocument();
    expect(within(totals).getByText('$7,000.00')).toBeInTheDocument();
    const futureCard = screen.getByRole('article', { name: 'New, Hire' });
    expect(within(futureCard).getAllByText('—')).toHaveLength(3);
    expect(within(futureCard).getByText('Future only')).toBeInTheDocument();
    const card = screen.getByRole('article', { name: 'Smith, John' });
    expect(within(card).queryByText('$9,000.00')).not.toBeInTheDocument();
    await user.click(within(card).getByRole('button'));
    expect(within(card).getByText('Future Project')).toBeInTheDocument();
    expect(within(card).getByText('$9,000.00')).toBeInTheDocument();
  });

  it('allows future funding to be viewed when there are no current employees', async () => {
    const user = userEvent.setup();
    render(<PersonnelTable data={[createRecord({ isFuture: true })]} />);
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /show future entries/i })
    );
    expect(
      screen.getByRole('article', { name: 'Smith, John' })
    ).toBeInTheDocument();
  });

  it('filters employee cards and PI totals by project search', () => {
    render(
      <PersonnelTable
        data={[
          createRecord({
            distributionPercent: 60,
            name: 'Adams, Alice',
            projectDescription: 'Sunny Project',
          }),
          createRecord({
            employeeId: '1002',
            name: 'Baker, Bob',
            projectDescription: 'Rainy Project',
          }),
        ]}
      />
    );
    fireEvent.input(
      screen.getByRole('searchbox', { name: 'Search personnel' }),
      { target: { value: 'Sunny' } }
    );
    expect(
      screen.getByRole('article', { name: 'Adams, Alice' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('article', { name: 'Baker, Bob' })
    ).not.toBeInTheDocument();
    const totals = screen.getByRole('region', { name: 'PI funding totals' });
    expect(within(totals).getByText('$3,000.00')).toBeInTheDocument();
    expect(within(totals).getByText('$1,200.00')).toBeInTheDocument();
    expect(within(totals).getByText('$4,200.00')).toBeInTheDocument();
  });

  it('shows an empty search state and hides unfilled positions', () => {
    render(
      <PersonnelTable
        data={[
          createRecord(),
          createRecord({
            employeeId: '',
            name: '',
            positionDescription: 'STDT 3',
          }),
        ]}
      />
    );
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.queryByText('STDT 3')).not.toBeInTheDocument();
    fireEvent.input(screen.getByRole('searchbox'), {
      target: { value: 'no match' },
    });
    expect(
      screen.getByText('No matching personnel found.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('retains FE date and CBR tooltips in the funding breakdown', async () => {
    const user = userEvent.setup();
    render(<PersonnelTable data={[createRecord()]} />);
    const card = screen.getByRole('article', { name: 'Smith, John' });
    await user.click(within(card).getByRole('button'));
    const table = within(card).getByRole('table');
    for (const [label, tooltip] of [
      ['FE Start', tooltipDefinitions.fundingEntryStart],
      ['FE End', tooltipDefinitions.fundingEntryEnd],
      ['Dist %', tooltipDefinitions.distributionPercent],
      ['Mo. CBR', tooltipDefinitions.monthlyCbr],
    ]) {
      const trigger = within(table).getByText(label)
        .parentElement as HTMLElement;
      await user.hover(trigger);
      expect(await screen.findByRole('tooltip')).toHaveTextContent(tooltip);
      await user.unhover(trigger);
    }
  });

  it('shows only internal tasks in the project breakdown', async () => {
    const user = userEvent.setup();
    render(
      <PersonnelTable
        data={[
          createRecord({ projectType: 'Internal', task: '441000' }),
          createRecord({
            projectId: 'PROJ2',
            projectType: 'Sponsored',
            task: '778100',
          }),
        ]}
      />
    );
    const card = screen.getByRole('article', { name: 'Smith, John' });
    await user.click(within(card).getByRole('button'));
    expect(within(card).getByText('441000')).toBeInTheDocument();
    expect(within(card).queryByText('778100')).not.toBeInTheDocument();
  });

  it('shows a warning for current funding ending within three months', async () => {
    const date = new Date();
    date.setMonth(date.getMonth() + 2);
    const user = userEvent.setup();
    render(
      <PersonnelTable
        data={[createRecord({ fundingEndDate: date.toISOString() })]}
      />
    );
    const card = screen.getByRole('article', { name: 'Smith, John' });
    expect(within(card).getByText('Funding ends soon')).toBeInTheDocument();
    await user.click(within(card).getByRole('button'));
    expect(
      within(card).getByText(formatDate(date.toISOString(), ''))
    ).toBeInTheDocument();
  });

  it('shows an empty state when no personnel exist', () => {
    render(<PersonnelTable data={[]} />);
    expect(screen.getByText('No personnel found.')).toBeInTheDocument();
  });

  it('exports no amounts for unsplit people', () => {
    render(
      <PersonnelTable
        data={[
          createRecord({
            earnCodeShare: null,
            earnCodeStatus: 'Unsplit',
            monthlyRate: 4321,
          }),
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Export' }));

    const csv = vi.mocked(downloadExcelCsv).mock.calls[0]?.[0];
    expect(csv).toContain('Smith, John');
    expect(csv).not.toContain('4,321');
    expect(csv).not.toContain('4321');
  });

  it('exports one row per funding entry with no earn code column', () => {
    render(
      <PersonnelTable
        data={[
          createRecord({
            earnCode: 'REG',
            earnCodeShare: 0.75,
            earnCodeStatus: 'Split',
          }),
          createRecord({
            earnCode: 'NNC',
            earnCodeShare: 0.25,
            earnCodeStatus: 'Split',
          }),
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Export' }));

    const csv = vi.mocked(downloadExcelCsv).mock.calls[0]?.[0] ?? '';
    expect(csv).not.toContain('Earn Code');
    expect(csv).not.toContain('NNC');
    expect(csv.match(/Smith, John/g)).toHaveLength(1);
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
