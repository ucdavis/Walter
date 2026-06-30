import type { FinancialSummaryRow } from '@/queries/financialSummary.ts';

export interface DimensionDef {
  codeField: keyof FinancialSummaryRow;
  key: string;        // matches the sproc @Dimensions whitelist key
  label: string;      // picker / column header
  nameField: keyof FinancialSummaryRow;
}

export const DIMENSIONS: DimensionDef[] = [
  { codeField: 'financialDeptDCode', key: 'FinancialDeptD', label: 'Financial Dept (D)', nameField: 'financialDeptDName' },
  { codeField: 'financialDeptECode', key: 'FinancialDeptE', label: 'Financial Dept (E)', nameField: 'financialDeptEName' },
  { codeField: 'financialDeptFCode', key: 'FinancialDeptF', label: 'Financial Dept (F)', nameField: 'financialDeptFName' },
  { codeField: 'financialDeptGCode', key: 'FinancialDeptG', label: 'Financial Dept (G)', nameField: 'financialDeptGName' },
  { codeField: 'fund', key: 'Fund', label: 'Fund', nameField: 'fundName' },
  { codeField: 'program', key: 'Program', label: 'Program', nameField: 'programName' },
  { codeField: 'activity', key: 'Activity', label: 'Activity', nameField: 'activityName' },
  { codeField: 'project', key: 'Project', label: 'Project', nameField: 'projectName' },
  { codeField: 'naturalAccount', key: 'NaturalAccount', label: 'Natural Account', nameField: 'naturalAccountName' },
  // Hierarchy rollup levels (0 = top .. 5 = nearest parent), groupable like the dept D-G levels.
  { codeField: 'fundParentLevel0Code', key: 'FundParentLevel0', label: 'Fund ▸ L0 top', nameField: 'fundParentLevel0Name' },
  { codeField: 'fundParentLevel1Code', key: 'FundParentLevel1', label: 'Fund ▸ L1', nameField: 'fundParentLevel1Name' },
  { codeField: 'fundParentLevel2Code', key: 'FundParentLevel2', label: 'Fund ▸ L2', nameField: 'fundParentLevel2Name' },
  { codeField: 'fundParentLevel3Code', key: 'FundParentLevel3', label: 'Fund ▸ L3', nameField: 'fundParentLevel3Name' },
  { codeField: 'fundParentLevel4Code', key: 'FundParentLevel4', label: 'Fund ▸ L4', nameField: 'fundParentLevel4Name' },
  { codeField: 'fundParentLevel5Code', key: 'FundParentLevel5', label: 'Fund ▸ L5 near', nameField: 'fundParentLevel5Name' },
  { codeField: 'activityParentLevel0Code', key: 'ActivityParentLevel0', label: 'Activity ▸ L0 top', nameField: 'activityParentLevel0Name' },
  { codeField: 'activityParentLevel1Code', key: 'ActivityParentLevel1', label: 'Activity ▸ L1', nameField: 'activityParentLevel1Name' },
  { codeField: 'activityParentLevel2Code', key: 'ActivityParentLevel2', label: 'Activity ▸ L2', nameField: 'activityParentLevel2Name' },
  { codeField: 'activityParentLevel3Code', key: 'ActivityParentLevel3', label: 'Activity ▸ L3', nameField: 'activityParentLevel3Name' },
  { codeField: 'activityParentLevel4Code', key: 'ActivityParentLevel4', label: 'Activity ▸ L4', nameField: 'activityParentLevel4Name' },
  { codeField: 'activityParentLevel5Code', key: 'ActivityParentLevel5', label: 'Activity ▸ L5 near', nameField: 'activityParentLevel5Name' },
  { codeField: 'naturalAccountParentLevel0Code', key: 'NaturalAccountParentLevel0', label: 'Natural Account ▸ L0 top', nameField: 'naturalAccountParentLevel0Name' },
  { codeField: 'naturalAccountParentLevel1Code', key: 'NaturalAccountParentLevel1', label: 'Natural Account ▸ L1', nameField: 'naturalAccountParentLevel1Name' },
  { codeField: 'naturalAccountParentLevel2Code', key: 'NaturalAccountParentLevel2', label: 'Natural Account ▸ L2', nameField: 'naturalAccountParentLevel2Name' },
  { codeField: 'naturalAccountParentLevel3Code', key: 'NaturalAccountParentLevel3', label: 'Natural Account ▸ L3', nameField: 'naturalAccountParentLevel3Name' },
  { codeField: 'naturalAccountParentLevel4Code', key: 'NaturalAccountParentLevel4', label: 'Natural Account ▸ L4', nameField: 'naturalAccountParentLevel4Name' },
  { codeField: 'naturalAccountParentLevel5Code', key: 'NaturalAccountParentLevel5', label: 'Natural Account ▸ L5 near', nameField: 'naturalAccountParentLevel5Name' },
];

export const activeColumns = (dimensions: string[]): DimensionDef[] =>
  DIMENSIONS.filter((d) => dimensions.includes(d.key));

export const rowGroupLabel = (row: FinancialSummaryRow, dimensions: string[]): string =>
  activeColumns(dimensions)
    .map((d) => {
      const code = row[d.codeField] ?? '';
      const name = row[d.nameField] ?? '';
      return name ? `${code} — ${name}` : String(code);
    })
    .join(' · ');

export interface ChartDatum {
  expense: number;
  income: number;
  label: string;
  net: number;
}

export const buildChartData = (rows: FinancialSummaryRow[], dimensions: string[]): ChartDatum[] =>
  rows.map((r) => ({
    expense: r.expense,
    income: r.income,
    label: rowGroupLabel(r, dimensions),
    net: r.net,
  }));
