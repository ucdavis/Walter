import { format, parseISO } from 'date-fns';

const ISO_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

function isValidCalendarDate(year: number, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }

  return day <= new Date(year, month, 0).getDate();
}

export function parseProjectDate(value: string | null) {
  if (!value) {
    return null;
  }

  const dateMatch = ISO_DATE_PREFIX.exec(value);
  const year = Number(dateMatch?.[1]);
  const month = Number(dateMatch?.[2]);
  const day = Number(dateMatch?.[3]);

  if (dateMatch) {
    return isValidCalendarDate(year, month, day)
      ? new Date(year, month - 1, day)
      : null;
  }

  const parsed = parseISO(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getProjectMonth(value: string | null) {
  const date = parseProjectDate(value);

  if (!date) {
    return null;
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    '0'
  )}`;
}

export const formatDate = (value: string | null, fallback = '—') => {
  const date = parseProjectDate(value);

  return date ? format(date, 'MM.dd.yyyy') : fallback;
};
