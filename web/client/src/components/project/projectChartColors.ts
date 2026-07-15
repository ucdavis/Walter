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

const NON_PERSONNEL_SERIES_COLOR_START = 3;
const PROJECT_NON_PERSONNEL_CATEGORY_COLORS = PROJECT_SERIES_COLORS.slice(
  NON_PERSONNEL_SERIES_COLOR_START
);

function projectSeriesColorByName(name: string) {
  const entry = PROJECT_SERIES_COLORS.find((color) => color.name === name);

  if (!entry) {
    throw new Error(`Missing project chart color for "${name}".`);
  }

  return entry.color;
}

function wrapColorIndex(index: number, length: number) {
  return ((index % length) + length) % length;
}

export const PROJECT_PERSONNEL_COLOR = projectSeriesColorByName('Personnel');

export function projectSeriesColor(index: number) {
  return PROJECT_SERIES_COLORS[index % PROJECT_SERIES_COLORS.length].color;
}

export function projectNonPersonnelCategoryColor(index: number) {
  const entry =
    PROJECT_NON_PERSONNEL_CATEGORY_COLORS[
      wrapColorIndex(index, PROJECT_NON_PERSONNEL_CATEGORY_COLORS.length)
    ];

  if (!entry) {
    throw new Error('Missing project chart colors for non-personnel categories.');
  }

  return entry.color;
}
