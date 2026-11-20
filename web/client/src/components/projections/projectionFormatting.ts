const money = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  maximumFractionDigits: 0,
  style: 'currency',
});
const compactMoney = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  maximumFractionDigits: 1,
  notation: 'compact',
  style: 'currency',
});

export const formatProjectionCurrency = (value: number | null | undefined) =>
  value == null ? '' : money.format(value);
export const compactProjectionCurrency = (value: number) =>
  compactMoney.format(value);

const colors = [
  'var(--color-primary)',
  '#2d806e',
  '#b76522',
  '#7854a2',
  '#ae4e66',
  '#487e95',
];

/** Keep each source's palette color when the displayed list is filtered. */
export const projectionSeriesColor = (index: number) =>
  colors[Math.max(0, index) % colors.length];

/** Use theme content for primary and contrast-based labels for fixed source colors. */
export function projectionSeriesTextColor(index: number) {
  const color = projectionSeriesColor(index);
  if (color === 'var(--color-primary)') {
    return 'var(--color-primary-content)';
  }
  const [red, green, blue] = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.040_45
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722 > 0.179
    ? '#000000'
    : '#ffffff';
}
