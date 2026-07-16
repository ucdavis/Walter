import { describe, expect, it } from 'vitest';
import {
  buildProjectCategoryColorMap,
  projectNonPersonnelCategoryColor,
} from '@/components/project/projectChartColors.ts';

describe('project chart colors', () => {
  it('keeps category colors stable when burndown periods omit earlier categories', () => {
    const expenditureChartColors = buildProjectCategoryColorMap([
      {
        budget: 100,
        committed: 0,
        expenditureCategory: '03 - Supplies / Services / Other Expenses',
        isPersonnel: 0,
        remainingNow: 80,
        spentToDate: 20,
      },
      {
        budget: 100,
        committed: 0,
        expenditureCategory: '07 - Travel',
        isPersonnel: 0,
        remainingNow: 80,
        spentToDate: 20,
      },
      {
        budget: 100,
        committed: 0,
        expenditureCategory: '09 - Indirect Costs',
        isPersonnel: 0,
        remainingNow: 80,
        spentToDate: 20,
      },
    ]);

    expect(expenditureChartColors.get('09 - Indirect Costs')).toBe(
      projectNonPersonnelCategoryColor(2)
    );
    expect(expenditureChartColors.get('09 - Indirect Costs')).not.toBe(
      projectNonPersonnelCategoryColor(1)
    );
  });

  it('uses the personnel color for all personnel categories', () => {
    const expenditureChartColors = buildProjectCategoryColorMap([
      {
        budget: 100,
        committed: 0,
        expenditureCategory: '01 - Salaries and Wages',
        isPersonnel: 1,
        remainingNow: 80,
        spentToDate: 20,
      },
      {
        budget: 100,
        committed: 0,
        expenditureCategory: '02 - Fringe Benefits',
        isPersonnel: 1,
        remainingNow: 80,
        spentToDate: 20,
      },
    ]);

    expect(expenditureChartColors.get('01 - Salaries and Wages')).toBe(
      expenditureChartColors.get('02 - Fringe Benefits')
    );
  });
});
