export const fundingMonthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    timeZone: 'UTC',
    year: 'numeric',
  });
export function fundingMonthRange(month: string) {
  const end = new Date(`${month}-01T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  return { endDate: end.toISOString().slice(0, 10), startDate: `${month}-01` };
}
export function fundingMonths(window: {
  endMonth: string;
  startMonth: string;
}) {
  const start =
    Number(window.startMonth.slice(0, 4)) * 12 +
    Number(window.startMonth.slice(5, 7)) -
    1;
  const end =
    Number(window.endMonth.slice(0, 4)) * 12 +
    Number(window.endMonth.slice(5, 7)) -
    1;
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => {
    const value = start + index;
    return `${Math.floor(value / 12)
      .toString()
      .padStart(4, '0')}-${((value % 12) + 1).toString().padStart(2, '0')}`;
  });
}
