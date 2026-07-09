export const PROJECT_SERIES_COLORS = [
  { color: 'var(--color-primary)', name: 'All Expenses' },
  { color: 'var(--color-ucd-poppy)', name: 'Personnel' },
  { color: 'var(--color-ucd-arboretum)', name: 'Non-Personnel' },
  { color: 'var(--color-ucd-tahoe)', name: 'Non-personnel category 1' },
  { color: 'var(--color-ucd-cabernet)', name: 'Non-personnel category 2' },
  {
    color: 'var(--color-ucd-sunflower)',
    name: 'Non-personnel category 3',
  },
  { color: 'var(--color-ucd-sage)', name: 'Non-personnel category 4' },
  { color: 'var(--color-ucd-putahcreek)', name: 'Non-personnel category 5' },
  { color: 'var(--color-ucd-redbud)', name: 'Non-personnel category 6' },
] as const;

export const PROJECT_PERSONNEL_COLOR = PROJECT_SERIES_COLORS[1].color;

export function projectSeriesColor(index: number) {
  return PROJECT_SERIES_COLORS[index % PROJECT_SERIES_COLORS.length].color;
}

export function projectNonPersonnelCategoryColor(index: number) {
  return projectSeriesColor(index + 3);
}
