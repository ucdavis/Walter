import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { downloadCsv, toCsv } from '@/lib/csv.ts';

interface ExportCsvButtonProps<T> {
  className?: string;
  columns: { header: string; key: keyof T }[];
  data: T[];
  filename: string;
}

export function ExportCsvButton<T>({
  className = '',
  columns,
  data,
  filename,
}: ExportCsvButtonProps<T>) {
  const handleExport = () => {
    const csv = toCsv(data, columns);
    downloadCsv(csv, filename);
  };

  return (
    <button
      className={`btn btn-sm btn-default ${className}`}
      onClick={handleExport}
      type="button"
    >
      <ArrowDownTrayIcon className="w-4 h-4" />
      Export CSV
    </button>
  );
}
