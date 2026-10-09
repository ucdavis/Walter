export const projectCostCategories = [
  '01 - Salaries and Wages',
  '02 - Fringe Benefits',
  '03 - Supplies / Services / Other Expenses',
  '07 - Travel',
  '09 - Indirect Costs',
] as const;

export function hasProjectCostCategory(category: string) {
  return projectCostCategories.includes(
    category as (typeof projectCostCategories)[number]
  );
}
