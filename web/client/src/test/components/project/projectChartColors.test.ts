import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PROJECT_EXPENDITURE_CATEGORY_COLORS,
  PROJECT_SERIES_COLORS,
  projectExpenditureCategoryColor,
  projectSeriesColor,
} from '@/components/project/projectChartColors.ts';

describe('project chart colors', () => {
  it('keeps spending colors above 3:1 on every light theme surface', () => {
    const css = readFileSync('src/main.css', 'utf8');
    const primary = css.match(/--color-primary-color:\s*(#[\da-f]{6})/i)?.[1];
    expect(primary).toBeDefined();
    const colors = new Set([
      ...Object.values(PROJECT_SERIES_COLORS),
      ...Object.values(PROJECT_EXPENDITURE_CATEGORY_COLORS),
      projectExpenditureCategoryColor('Unknown category'),
      projectSeriesColor('Unknown series'),
    ]);
    for (const value of colors) {
      const color = value === 'var(--color-primary)' ? primary! : value;
      expect(color).toMatch(/^#[\da-f]{6}$/i);
      for (const background of ['#ffffff', '#fafafa', '#e9e9e9']) {
        const foregroundLuminance = relativeLuminance(color);
        const backgroundLuminance = relativeLuminance(background);
        const contrast =
          (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
          (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
        expect(contrast, `${color} on ${background}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
  it('defines category colors in one explicit map', () => {
    expect(PROJECT_EXPENDITURE_CATEGORY_COLORS).toMatchObject({
      '01 - Salaries and Wages': PROJECT_SERIES_COLORS.Personnel,
      '02 - Fringe Benefits': PROJECT_SERIES_COLORS.Personnel,
      '03 - Supplies / Services / Other Expenses': '#327db0',
      '09 - Indirect Costs': '#6f8035',
    });
  });

  it('keeps category colors stable when category lists are pruned', () => {
    const fullCategoryList = [
      '03 - Supplies / Services / Other Expenses',
      '07 - Travel',
      '09 - Indirect Costs',
    ];
    const prunedCategoryList = ['07 - Travel', '09 - Indirect Costs'];

    const fullIndirectColor = projectExpenditureCategoryColor(
      fullCategoryList[2]
    );
    const prunedIndirectColor = projectExpenditureCategoryColor(
      prunedCategoryList[1]
    );

    expect(fullIndirectColor).toBe(prunedIndirectColor);
    expect(fullIndirectColor).toBe('#6f8035');
  });

  it('looks up rollup series colors by series name', () => {
    expect(projectSeriesColor('All Expenses')).toBe(
      PROJECT_SERIES_COLORS['All Expenses']
    );
    expect(projectSeriesColor('Personnel')).toBe(
      PROJECT_SERIES_COLORS.Personnel
    );
    expect(projectSeriesColor('Non-Personnel')).toBe(
      PROJECT_SERIES_COLORS['Non-Personnel']
    );
  });
});

function relativeLuminance(hex: string) {
  const [red, green, blue] = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.040_45
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}
