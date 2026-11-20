// Spending colors complement the Walter theme and clear 3:1 on its light surfaces.
export const PROJECT_SERIES_COLORS = {
  'All Expenses': 'var(--color-primary)',
  'Non-Personnel': '#278675',
  Personnel: '#b76522',
} as const;

export const PROJECT_EXPENDITURE_CATEGORY_COLORS = {
  '01 - Salaries and Wages': PROJECT_SERIES_COLORS.Personnel,
  '02 - Fringe Benefits': PROJECT_SERIES_COLORS.Personnel,
  '03 - Supplies / Services / Other Expenses': '#327db0',
  '04 - Equipment and Facilities': '#7955a4',
  '05 - Contracts (Subrecipients)': '#947600',
  '06 - UC Multi-Campus': '#3a865b',
  '07 - Travel': '#007c91',
  '08 - Fellowship & Scholarships': '#b54c83',
  '09 - Indirect Costs': '#6f8035',
  '99 - Uncategorized': '#68758a',

  // Legacy/test labels still seen in local fixtures.
  '04 - Supplies': '#7955a4',
  '04 - Travel': '#7955a4',
  '05 - Fellowship & Scholarships': '#947600',
  '05 - Travel': '#947600',
  '06 - Indirect Costs': '#3a865b',
  '07 - Fellowships': '#007c91',
} as const;

export const PROJECT_PERSONNEL_COLOR = PROJECT_SERIES_COLORS.Personnel;
const PROJECT_UNKNOWN_CATEGORY_COLOR = '#68758a';

export function projectSeriesColor(seriesName: string) {
  return (
    PROJECT_SERIES_COLORS[seriesName as keyof typeof PROJECT_SERIES_COLORS] ??
    PROJECT_UNKNOWN_CATEGORY_COLOR
  );
}

export function projectExpenditureCategoryColor(expenditureCategory: string) {
  return (
    PROJECT_EXPENDITURE_CATEGORY_COLORS[
      expenditureCategory as keyof typeof PROJECT_EXPENDITURE_CATEGORY_COLORS
    ] ?? PROJECT_UNKNOWN_CATEGORY_COLOR
  );
}
