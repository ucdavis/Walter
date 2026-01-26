import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { downloadCsv, toCsv } from '@/lib/csv.ts';

type CsvValue = string | number | boolean | null | undefined;

interface ExportCsvButtonProps<T extends Record<string, CsvValue>> {
  data: T[];
  columns: { key: keyof T; header: string }[];
  filename: string;
  className?: string;
}

export function ExportCsvButton<T extends Record<string, CsvValue>>({
  data,
  columns,
  filename,
  className = '',
}: ExportCsvButtonProps<T>) {
  const handleExport = () => {
    const csv = toCsv(data, columns);
    downloadCsv(csv, filename);
  };

  return (
    <button
      type="button"
      className={`btn btn-sm btn-ghost ${className}`}
      onClick={handleExport}
    >
      <ArrowDownTrayIcon className="w-4 h-4" />
      Export CSV
    </button>
  );
}