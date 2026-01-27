import { format, parseISO } from 'date-fns';

export const formatDate = (value: string | null, fallback = '—') => {
  if (!value) {
    return fallback;
  }
  try {
    return format(parseISO(value), 'MM.dd.yyyy');
  } catch {
    return fallback;
  }
};
