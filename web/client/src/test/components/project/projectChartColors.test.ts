import { describe, expect, it } from 'vitest';
import {
  buildProjectCategoryColorMap,
  projectNonPersonnelCategoryColor,
} from '@/components/project/projectChartColors.ts';

const category = (
  expenditureCategory: string,
  isPersonnel = 0
) => ({
  budget: 100,
  committed: 0,
  expenditureCategory,
  isPersonnel,
  remainingNow: 80,
  spentToDate: 20,
});

describe('project chart colors', () => {
  it('keeps category colors stable when burndown periods omit earlier categories', () => {
    const fullCategoryColors = buildProjectCategoryColorMap([
      category('03 - Supplies / Services / Other Expenses'),
      category('07 - Travel'),
      category('09 - Indirect Costs'),
    ]);
    const prunedCategoryColors = buildProjectCategoryColorMap([
      category('07 - Travel'),
      category('09 - Indirect Costs'),
    ]);

    expect(fullCategoryColors.get('09 - Indirect Costs')).toBe(
      prunedCategoryColors.get('09 - Indirect Costs')
    );
    expect(fullCategoryColors.get('09 - Indirect Costs')).toBe(
      projectNonPersonnelCategoryColor(6)
    );
  });

  it('uses the personnel color for all personnel categories', () => {
    const expenditureChartColors = buildProjectCategoryColorMap([
      category('01 - Salaries and Wages', 1),
      category('02 - Fringe Benefits', 1),
    ]);

    expect(expenditureChartColors.get('01 - Salaries and Wages')).toBe(
      expenditureChartColors.get('02 - Fringe Benefits')
    );
  });
});
