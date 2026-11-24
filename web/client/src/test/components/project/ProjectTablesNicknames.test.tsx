import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InternalProjectsTable } from '@/components/project/InternalProjectsTable.tsx';
import { SponsoredProjectsTable } from '@/components/project/SponsoredProjectsTable.tsx';
import { downloadExcelCsv } from '@/lib/csv.ts';
import type { ProjectRecord } from '@/queries/project.ts';
import {
  buildNicknameLookup,
  NicknamesContext,
} from '@/queries/projectNicknames.ts';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

vi.mock('@/lib/csv.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/csv.ts')>();
  return { ...actual, downloadExcelCsv: vi.fn() };
});

afterEach(() => {
  cleanup();
  vi.mocked(downloadExcelCsv).mockClear();
});

const project = (overrides: Partial<ProjectRecord>): ProjectRecord =>
  ({
    awardEndDate: '2099-12-31',
    awardStartDate: '2024-01-01',
    balance: 100,
    budget: 100,
    commitments: 0,
    displayName: 'Official Sunny Project',
    expenses: 0,
    projectName: 'Official Sunny Project',
    projectNumber: 'P1',
    projectOwningOrg: 'ORG',
    projectStatusCode: 'ACTIVE',
    projectType: 'Internal',
    taskName: 'Official Task One',
    taskNum: 'T001',
    taskStatus: 'Active',
    ...overrides,
  }) as ProjectRecord;

const nickname = (
  projectNumber: string,
  taskNumber: string,
  value: string
) => ({
  nickname: value,
  projectNumber,
  taskNumber,
});

const nicknames = buildNicknameLookup(
  [nickname('P1', '', 'Smith startup'), nickname('P1', 'T001', 'Equipment')],
  true
);

const records = [
  project({}),
  project({
    displayName: 'Official Rainy Project',
    projectName: 'Official Rainy Project',
    projectNumber: 'P2',
    taskName: 'Official Task Two',
    taskNum: 'T002',
  }),
];

const withNicknames = (children: ReactNode) =>
  render(
    <NicknamesContext.Provider value={nicknames}>
      {children}
    </NicknamesContext.Provider>
  );

const search = (value: string) =>
  fireEvent.input(screen.getByPlaceholderText('Search all columns...'), {
    target: { value },
  });

const exportedCsv = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Export' }));
  return vi.mocked(downloadExcelCsv).mock.calls[0]?.[0] as string;
};

describe('InternalProjectsTable with nicknames', () => {
  const renderTable = () =>
    withNicknames(
      <InternalProjectsTable
        discrepancies={new Set()}
        iamId="1000000123"
        records={records}
      />
    );

  it('shows project and task nicknames and hides the official task name', () => {
    renderTable();
    expect(screen.getByText('Smith startup')).toBeInTheDocument();
    expect(screen.getByText('Equipment')).toBeInTheDocument();
    expect(screen.queryByText('Official Task One')).not.toBeInTheDocument();
    expect(screen.getByText('Official Task Two')).toBeInTheDocument();
  });

  it('finds the row by nickname and by official name', () => {
    renderTable();
    search('Smith');
    expect(screen.getByText('T001')).toBeInTheDocument();
    expect(screen.queryByText('T002')).not.toBeInTheDocument();
    search('Equipment');
    expect(screen.getByText('T001')).toBeInTheDocument();
    expect(screen.queryByText('T002')).not.toBeInTheDocument();
    search('Official Sunny');
    expect(screen.getByText('T001')).toBeInTheDocument();
    expect(screen.queryByText('T002')).not.toBeInTheDocument();
  });

  it('exports official names only', () => {
    renderTable();
    const csv = exportedCsv();
    expect(csv).toContain('Official Sunny Project');
    expect(csv).toContain('Official Task One');
    expect(csv).not.toContain('Nickname');
    expect(csv).not.toContain('Smith startup');
    expect(csv).not.toContain('Equipment');
  });
});

describe('SponsoredProjectsTable with nicknames', () => {
  const sponsored = records.map((record) => ({
    ...record,
    projectType: 'Sponsored',
  }));
  const renderTable = () =>
    withNicknames(
      <SponsoredProjectsTable iamId="1000000123" records={sponsored} />
    );

  it('shows the project nickname with the official name beneath', () => {
    renderTable();
    expect(screen.getByText('Smith startup')).toBeInTheDocument();
    expect(screen.getByText('Official Sunny Project')).toBeInTheDocument();
    expect(screen.getByText('Official Rainy Project')).toBeInTheDocument();
  });

  it('finds the row by nickname and by official name', () => {
    renderTable();
    search('Smith');
    expect(screen.getByText('Smith startup')).toBeInTheDocument();
    expect(
      screen.queryByText('Official Rainy Project')
    ).not.toBeInTheDocument();
    search('Official Sunny');
    expect(screen.getByText('Smith startup')).toBeInTheDocument();
    expect(
      screen.queryByText('Official Rainy Project')
    ).not.toBeInTheDocument();
  });

  it('exports official names only', () => {
    renderTable();
    const csv = exportedCsv();
    expect(csv).toContain('Official Sunny Project');
    expect(csv).not.toContain('Nickname');
    expect(csv).not.toContain('Smith startup');
  });
});
