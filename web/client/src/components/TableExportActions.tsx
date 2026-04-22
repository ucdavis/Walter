import type { Table } from '@tanstack/react-table';
import { type CsvColumn } from '@/lib/csv.ts';
import { ExportDataButton } from '@/components/ExportDataButton.tsx';

interface TableExportActionsProps<TTableRow extends object, TExportRow extends object> {
  baseFilename: string;
  columns: CsvColumn<TExportRow>[];
  data: TTableRow[];
  table: Table<TTableRow>;
  toRows: (rows: TTableRow[]) => TExportRow[];
}

export function TableExportActions<
  TTableRow extends object,
  TExportRow extends object,
>({
  baseFilename,
  columns,
  data,
  table,
  toRows,
}: TableExportActionsProps<TTableRow, TExportRow>) {
  const hasActiveFilter =
    String(table.getState().globalFilter ?? '').trim() !== '';
  const filteredRows = table.getFilteredRowModel().rows.map((row) => row.original);

  return (
    <>
      <ExportDataButton
        columns={columns}
        data={toRows(data)}
        filename={`${baseFilename}.csv`}
      />
      {hasActiveFilter ? (
        <ExportDataButton
          columns={columns}
          data={toRows(filteredRows)}
          filename={`${baseFilename}-filtered.csv`}
          label="Export filtered"
        />
      ) : null}
    </>
  );
}
