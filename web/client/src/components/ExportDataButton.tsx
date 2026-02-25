import { DocumentChartBarIcon } from '@heroicons/react/24/outline';
import { type CsvColumn, downloadExcelCsv, toExcelCsv } from '@/lib/csv.ts';

interface ExportDataButtonProps<T> {
  className?: string;
  columns: CsvColumn<T>[];
  data: T[];
  filename: string;
}

export function ExportDataButton<T>({
  className = '',
  columns,
  data,
  filename,
}: ExportDataButtonProps<T>) {
  const handleExport = () => {
    const csv = toExcelCsv(data, columns);
    downloadExcelCsv(csv, filename);
  };

  return (
    <button
      className={`btn btn-sm btn-default ${className}`}
      onClick={handleExport}
      type="button"
    >
      <DocumentChartBarIcon className="w-4 h-4" />
      Export
    </button>
  );
}
