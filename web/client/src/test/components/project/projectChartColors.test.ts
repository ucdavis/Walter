import { describe, expect, it } from 'vitest';
import {
  PROJECT_EXPENDITURE_CATEGORY_COLORS,
  PROJECT_SERIES_COLORS,
  projectExpenditureCategoryColor,
  projectSeriesColor,
} from '@/components/project/projectChartColors.ts';

describe('project chart colors', () => {
  it('defines category colors in one explicit map', () => {
    expect(PROJECT_EXPENDITURE_CATEGORY_COLORS).toMatchObject({
      '01 - Salaries and Wages': PROJECT_SERIES_COLORS.Personnel,
      '02 - Fringe Benefits': PROJECT_SERIES_COLORS.Personnel,
      '03 - Supplies / Services / Other Expenses': 'var(--color-ucd-tahoe)',
      '04 - Equipment and Facilities': 'var(--color-ucd-recpool)',
      '05 - Contracts (Subrecipients)': 'var(--color-ucd-sunflower)',
      '06 - UC Multi-Campus': 'var(--color-ucd-sage)',
      '07 - Travel': 'var(--color-ucd-rain)',
      '08 - Fellowship & Scholarships': 'var(--color-ucd-strawberry)',
      '09 - Indirect Costs': 'var(--color-ucd-farmersmarket)',
      '99 - Uncategorized': 'var(--color-ucd-rose)',
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
    expect(fullIndirectColor).toBe('var(--color-ucd-farmersmarket)');
  });

  it('looks up rollup series colors by series name', () => {
    expect(projectSeriesColor('All Expenses')).toBe(
      PROJECT_SERIES_COLORS['All Expenses']
    );
    expect(projectSeriesColor('Personnel')).toBe(PROJECT_SERIES_COLORS.Personnel);
    expect(projectSeriesColor('Personnel')).toBe('var(--color-ucd-quad)');
    expect(projectSeriesColor('Non-Personnel')).toBe(
      PROJECT_SERIES_COLORS['Non-Personnel']
    );
    expect(projectSeriesColor('Non-Personnel')).toBe('var(--color-ucd-pinot)');
  });
});
