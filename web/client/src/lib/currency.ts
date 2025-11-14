type NegativeStyle = 'minus' | 'parentheses' | 'plain';

export type FormatCurrencyOptions = {
  currency?: string;
  locale?: string;
  negativeStyle?: NegativeStyle;
};

const DEFAULT_LOCALE = 'en-US';
const DEFAULT_CURRENCY = 'USD';
const DEFAULT_NEGATIVE_STYLE: NegativeStyle = 'minus';

const formatterCache = new Map<string, Intl.NumberFormat>();

const getFormatter = (locale: string, currency: string) => {
  const cacheKey = `${locale}-${currency}`;
  const cached = formatterCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.NumberFormat(locale, {
    currency,
    signDisplay: 'never',
    style: 'currency',
  });

  formatterCache.set(cacheKey, formatter);
  return formatter;
};

export const formatCurrency = (
  value: number | string | null | undefined,
  options: FormatCurrencyOptions = {}
) => {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const amount = typeof value === 'string' ? Number(value) : value;

  if (!Number.isFinite(amount)) {
    return '';
  }

  const locale = options.locale ?? DEFAULT_LOCALE;
  const currency = options.currency ?? DEFAULT_CURRENCY;
  const negativeStyle = options.negativeStyle ?? DEFAULT_NEGATIVE_STYLE;

  const formatter = getFormatter(locale, currency);
  const absoluteFormatted = formatter.format(Math.abs(amount));

  if (amount >= 0 || negativeStyle === 'plain') {
    return absoluteFormatted;
  }

  if (negativeStyle === 'parentheses') {
    return `(${absoluteFormatted})`;
  }

  return `-${absoluteFormatted}`;
};
