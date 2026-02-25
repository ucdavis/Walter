import { format, parseISO } from 'date-fns';

type CsvValue = string | number | boolean | null | undefined;

interface CsvOptions {
  includeBom?: boolean;
  lineEnding?: '\n' | '\r\n';
}

export type CsvFormat = 'currency' | 'date';

export interface CsvColumn<T> {
  format?: CsvFormat;
  header: string;
  key: keyof T;
}

function escapeCsvValue(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const defaultFormat = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value);
};

function formatDateCsv(value: unknown): string {
  if (value === null || value === undefined) return '';
  try {
    return format(parseISO(String(value)), 'MM/dd/yyyy');
  } catch {
    return String(value);
  }
}

function formatCurrencyCsv(value: unknown): string {
  if (value === null || value === undefined) return '';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(amount);
}

function resolveFormat(fmt?: CsvFormat): (value: unknown) => string {
  if (fmt === 'date') return formatDateCsv;
  if (fmt === 'currency') return formatCurrencyCsv;
  return defaultFormat;
}

export function toCsv<T>(
  rows: T[],
  columns: CsvColumn<T>[],
  options?: CsvOptions
): string {
  const lineEnding = options?.lineEnding ?? '\n';
  const headers = columns.map((c) => escapeCsvValue(c.header)).join(',');
  const dataRows = rows.map((row) =>
    columns
      .map((c) => {
        const fmt = resolveFormat(c.format);
        return escapeCsvValue(fmt(row[c.key]));
      })
      .join(',')
  );
  const csv = [headers, ...dataRows].join(lineEnding);
  return options?.includeBom ? `\ufeff${csv}` : csv;
}

export function toExcelCsv<T>(
  rows: T[],
  columns: CsvColumn<T>[]
): string {
  return toCsv(rows, columns, { includeBom: true, lineEnding: '\r\n' });
}

export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadExcelCsv(content: string, filename: string): void {
  downloadCsv(content, filename);
}
