export const PROJECT_SERIES_COLORS = {
  'All Expenses': 'var(--color-primary)',
  'Non-Personnel': 'var(--color-ucd-arboretum)',
  Personnel: 'var(--color-ucd-poppy)',
} as const;

export const PROJECT_EXPENDITURE_CATEGORY_COLORS = {
  '01 - Salaries and Wages': PROJECT_SERIES_COLORS.Personnel,
  '02 - Fringe Benefits': PROJECT_SERIES_COLORS.Personnel,
  '03 - Supplies / Services / Other Expenses': 'var(--color-ucd-tahoe)',
  '04 - Equipment and Facilities': 'var(--color-ucd-cabernet)',
  '05 - Contracts (Subrecipients)': 'var(--color-ucd-sunflower)',
  '06 - UC Multi-Campus': 'var(--color-ucd-sage)',
  '07 - Travel': 'var(--color-ucd-putahcreek)',
  '08 - Fellowship & Scholarships': 'var(--color-ucd-redbud)',
  '09 - Indirect Costs': 'var(--color-ucd-farmersmarket)',
  '99 - Uncategorized': 'var(--color-ucd-rose)',

  // Legacy/test labels still seen in local fixtures.
  '04 - Supplies': 'var(--color-ucd-cabernet)',
  '04 - Travel': 'var(--color-ucd-cabernet)',
  '05 - Fellowship & Scholarships': 'var(--color-ucd-sunflower)',
  '05 - Travel': 'var(--color-ucd-sunflower)',
  '06 - Indirect Costs': 'var(--color-ucd-sage)',
  '07 - Fellowships': 'var(--color-ucd-putahcreek)',
} as const;

export const PROJECT_PERSONNEL_COLOR = PROJECT_SERIES_COLORS.Personnel;
const PROJECT_UNKNOWN_CATEGORY_COLOR = 'var(--color-ucd-rose)';

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
