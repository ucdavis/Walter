type CsvValue = string | number | boolean | null | undefined;

interface CsvOptions {
  includeBom?: boolean;
  lineEnding?: '\n' | '\r\n';
}

function escapeCsvValue(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv<T>(
  rows: T[],
  columns: { key: keyof T; header: string }[],
  options?: CsvOptions
): string {
  const lineEnding = options?.lineEnding ?? '\n';
  const headers = columns.map((c) => escapeCsvValue(c.header)).join(',');
  const dataRows = rows.map((row) =>
    columns.map((c) => escapeCsvValue(row[c.key] as CsvValue)).join(',')
  );
  const csv = [headers, ...dataRows].join(lineEnding);
  return options?.includeBom ? `\ufeff${csv}` : csv;
}

export function toExcelCsv<T>(
  rows: T[],
  columns: { key: keyof T; header: string }[]
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
