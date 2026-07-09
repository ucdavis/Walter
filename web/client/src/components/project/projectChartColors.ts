export const PROJECT_SERIES_COLORS = [
  { color: 'var(--color-primary)', name: 'All Expenses' },
  { color: 'var(--color-ucd-poppy)', name: 'Personnel' },
  { color: 'var(--color-ucd-arboretum)', name: 'Non-Personnel' },
  { color: 'var(--color-ucd-tahoe)', name: '03 Supplies' },
  { color: 'var(--color-ucd-cabernet)', name: '04 Equipment' },
  {
    color: 'var(--color-ucd-sunflower)',
    name: '05 Contracts',
  },
  { color: 'var(--color-ucd-sage)', name: '06 UC Multi-Campus' },
  { color: 'var(--color-ucd-putahcreek)', name: '07 Travel' },
  { color: 'var(--color-ucd-redbud)', name: '08 Fellowship' },
  { color: 'var(--color-ucd-farmersmarket)', name: '09 Indirect' },
  { color: 'var(--color-ucd-rose)', name: '99 Uncategorized' },
] as const;

export const PROJECT_PERSONNEL_COLOR = PROJECT_SERIES_COLORS[1].color;

export function projectSeriesColor(index: number) {
  return PROJECT_SERIES_COLORS[index % PROJECT_SERIES_COLORS.length].color;
}

export function projectNonPersonnelCategoryColor(index: number) {
  return projectSeriesColor(index + 3);
}
