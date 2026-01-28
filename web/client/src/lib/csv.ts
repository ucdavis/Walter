type CsvValue = string | number | boolean | null | undefined;

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
  columns: { key: keyof T; header: string }[]
): string {
  const headers = columns.map((c) => escapeCsvValue(c.header)).join(',');
  const dataRows = rows.map((row) =>
    columns.map((c) => escapeCsvValue(row[c.key] as CsvValue)).join(',')
  );
  return [headers, ...dataRows].join('\n');
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
