import { DocumentChartBarIcon } from '@heroicons/react/24/outline';
import { downloadCsv, toCsv } from '@/lib/csv.ts';

type CsvValue = string | number | boolean | null | undefined;

interface ExportCsvButtonProps<T extends Record<string, CsvValue>> {
  className?: string;
  columns: { header: string; key: keyof T }[];
  data: T[];
  filename: string;
}

export function ExportCsvButton<T extends Record<string, CsvValue>>({
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
      <DocumentChartBarIcon className="w-4 h-4" />
      Export CSV
    </button>
  );
}
