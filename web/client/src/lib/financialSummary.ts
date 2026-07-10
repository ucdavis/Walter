import type { FinancialSummaryRow } from '@/queries/financialSummary.ts';

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
