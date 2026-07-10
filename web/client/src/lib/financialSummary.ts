import type { FinancialSummaryRow } from '@/queries/financialSummary.ts';
import type { LabelSegments } from '@/queries/financialSummaryLabels.ts';

export interface DimensionDef {
  codeField: keyof FinancialSummaryRow;
  descField: keyof FinancialSummaryRow;
  key: string;        // matches the sproc @Dimensions whitelist key
  label: string;      // picker / column header
}

// Child-level chart-string segments only; hierarchy participates in filtering, never grouping.
export const DIMENSIONS: DimensionDef[] = [
  { codeField: 'dept', descField: 'deptDesc', key: 'Dept', label: 'Department' },
  { codeField: 'fund', descField: 'fundDesc', key: 'Fund', label: 'Fund' },
  { codeField: 'account', descField: 'accountDesc', key: 'Account', label: 'Account' },
  { codeField: 'purpose', descField: 'purposeDesc', key: 'Purpose', label: 'Purpose' },
  { codeField: 'project', descField: 'projectDesc', key: 'Project', label: 'Project' },
  { codeField: 'activity', descField: 'activityDesc', key: 'Activity', label: 'Activity' },
];

export interface MeasureDef {
  key: 'assets' | 'liabilities' | 'netPosition' | 'revenue' | 'expenses' | 'endingBalance';
  label: string;
}

export const MEASURES: MeasureDef[] = [
  { key: 'assets', label: 'Assets' },
  { key: 'liabilities', label: 'Liabilities' },
  { key: 'netPosition', label: 'Net Position' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'endingBalance', label: 'Ending Balance' },
];

export const activeColumns = (dimensions: string[]): DimensionDef[] =>
  DIMENSIONS.filter((d) => dimensions.includes(d.key));

export const rowGroupLabel = (row: FinancialSummaryRow, dimensions: string[]): string =>
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
export const rowLabelSegments = (
  row: FinancialSummaryRow,
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
    segments[d.codeField as keyof LabelSegments] = String(row[d.codeField] ?? '');
  }
  return segments;
};

export const labelKeyOf = (s: LabelSegments): string =>
  [s.dept, s.fund, s.account, s.purpose, s.project, s.activity].join('|');
