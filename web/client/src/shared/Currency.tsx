import { formatCurrency, type FormatCurrencyOptions } from '@/lib/currency.ts';

type CurrencyProps = FormatCurrencyOptions & {
  className?: string;
  value: number | string | null | undefined;
};

export function Currency({
  className,
  value,
  ...formatOptions
}: CurrencyProps) {
  const numericValue =
    typeof value === 'string' ? Number(value) : (value ?? undefined);
  const isNegative =
    typeof numericValue === 'number' &&
    Number.isFinite(numericValue) &&
    numericValue < 0;
  const resolvedClassName =
    className ?? (isNegative ? 'text-error' : undefined);
  const formatted = formatCurrency(value, formatOptions);

  return <span className={resolvedClassName}>{formatted}</span>;
}
