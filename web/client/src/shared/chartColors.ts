// Dark Gunrock colors support both chart lines and filled segments with light labels.
const SERIES_COLORS = [
  'var(--color-ucd-gunrock)',
  'var(--color-ucd-delta)',
  'var(--color-ucd-california)',
  'var(--color-ucd-cabernet)',
  'var(--color-ucd-redbud)',
  'var(--color-ucd-redwood)',
] as const;

/** Use the item's index in the complete collection so filtering preserves its color. */
export function chartSeriesColor(index: number) {
  return SERIES_COLORS[Math.max(0, index) % SERIES_COLORS.length];
}
