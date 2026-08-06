import type { DepartmentBalanceRow } from '@/queries/departmentBalances.ts';
import type { LabelSegments } from '@/queries/chartStringLabels.ts';

export interface DimensionDef {
  codeField: keyof DepartmentBalanceRow;
  descField: keyof DepartmentBalanceRow;
  key: string;        // matches the sproc @Dimensions whitelist key
  label: string;      // picker / column header
}

// Child-level chart-string segments only; hierarchy participates in filtering, never grouping.
export const DIMENSIONS: DimensionDef[] = [
  { codeField: 'entity', descField: 'entityDesc', key: 'Entity', label: 'Entity' },
  { codeField: 'fund', descField: 'fundDesc', key: 'Fund', label: 'Fund' },
  { codeField: 'dept', descField: 'deptDesc', key: 'Dept', label: 'Financial Department' },
  { codeField: 'account', descField: 'accountDesc', key: 'Account', label: 'Account' },
  { codeField: 'purpose', descField: 'purposeDesc', key: 'Purpose', label: 'Purpose' },
  { codeField: 'program', descField: 'programDesc', key: 'Program', label: 'Program' },
  { codeField: 'project', descField: 'projectDesc', key: 'Project', label: 'Project' },
  { codeField: 'activity', descField: 'activityDesc', key: 'Activity', label: 'Activity' },
];

export interface MeasureDef {
  key: 'assets' | 'liabilities' | 'netPosition' | 'revenue' | 'expenses' | 'endingBalance';
  label: string;
}

// Measures always displayed; assets/liabilities are opt-in via the report's toggle.
export const MEASURES: MeasureDef[] = [
  { key: 'netPosition', label: 'Net Position' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'endingBalance', label: 'Ending Balance' },
];

export const BALANCE_SHEET_MEASURES: MeasureDef[] = [
  { key: 'assets', label: 'Assets' },
  { key: 'liabilities', label: 'Liabilities' },
];

export const activeMeasures = (includeBalanceSheet: boolean): MeasureDef[] =>
  includeBalanceSheet ? [...BALANCE_SHEET_MEASURES, ...MEASURES] : MEASURES;

export const activeColumns = (dimensions: string[]): DimensionDef[] =>
  DIMENSIONS.filter((d) => dimensions.includes(d.key));

export const rowGroupLabel = (row: DepartmentBalanceRow, dimensions: string[]): string =>
  activeColumns(dimensions)
    .map((d) => {
      const code = row[d.codeField] ?? '';
      const desc = row[d.descField] ?? '';
      return desc && String(desc) !== String(code)
        ? `${code} — ${desc}`
        : String(code);
    })
    .join(' · ');

// A label's key is the exact segment combination its row displayed when written: the selected
// dimensions supply which segments are set, the row supplies the codes, all others stay ''.
// Entity and Program are not part of the shared label key, so they never contribute.
export const rowLabelSegments = (
  row: DepartmentBalanceRow,
  dimensions: string[]
): LabelSegments => {
  const segments: LabelSegments = {
    account: '',
    activity: '',
    dept: '',
    fund: '',
    project: '',
    purpose: '',
  };
  for (const d of activeColumns(dimensions)) {
    if (d.codeField in segments) {
      segments[d.codeField as keyof LabelSegments] = String(row[d.codeField] ?? '');
    }
  }
  return segments;
};

export const labelKeyOf = (s: LabelSegments): string =>
  [s.dept, s.fund, s.account, s.purpose, s.project, s.activity].join('|');

const MAX_CODES_PER_PARAM = 500;

export const parseCodeList = (value: unknown): string[] => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return [];
  }
  const codes = [
    ...new Set(
      String(value)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ];
  if (codes.length > MAX_CODES_PER_PARAM) {
    throw new Error(`Too many codes in URL parameter (${codes.length} > ${MAX_CODES_PER_PARAM}).`);
  }
  return codes;
};

export const joinCodeList = (values: string[]): string | undefined =>
  values.length > 0 ? values.join(',') : undefined;

export const parseFieldList = (value: unknown): string[] =>
  parseCodeList(value)
    .map((k) => DIMENSIONS.find((d) => d.key.toLowerCase() === k.toLowerCase())?.key)
    .filter((k): k is string => k !== undefined);
