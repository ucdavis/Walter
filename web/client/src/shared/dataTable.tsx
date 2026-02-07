'use no memo';

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  InitialTableState,
  useReactTable,
} from '@tanstack/react-table';

// TanStack Table types `TableOptions.columns` as `ColumnDef<TData, any>[]` because
// tables commonly mix column value types (string/number/etc) in a single array.
// We don't like the use of `any`, so a good compromise is to create an alias here so we only have to suppress the linter once.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DataTableColumnDef<TData extends object> = ColumnDef<TData, any>;
type DataTableColumns<TData extends object> = Array<DataTableColumnDef<TData>>;

function hasAnyFooter<TData extends object>(
  columns: DataTableColumns<TData>
): boolean {
  for (const col of columns) {
    const colAny = col as unknown as { columns?: unknown; footer?: unknown };
    if (colAny.footer !== undefined) {
      return true;
    }
    if (Array.isArray(colAny.columns) && colAny.columns.length > 0) {
      if (hasAnyFooter(colAny.columns as DataTableColumns<TData>)) {
        return true;
      }
    }
  }
  return false;
}

interface DataTableProps<TData extends object> {
  columns: DataTableColumns<TData>;
  data: TData[];
  footerRowClassName?: string;
  globalFilter?: 'left' | 'right' | 'none'; // Controls the position of the search box
  initialState?: InitialTableState; // Optional initial state for the table, use for stuff like setting page size or sorting
  pagination?: 'auto' | 'on' | 'off'; // 'auto' shows controls only when needed; 'off' disables pagination entirely
  // ...any other props, initial state?, export? pages? filter? sorting?
}

export const DataTable = <TData extends object>({
  columns,
  data,
  footerRowClassName,
  globalFilter = 'right',
  initialState,
  pagination = 'auto',
}: DataTableProps<TData>) => {
  // see note in https://tanstack.com/table/latest/docs/installation#react-table.  Added "use no memo" just to be safe but it's unnecessary.
  // once tanstack updates their docs and makes sure it works w/ react compiler (even though we aren't using it yet), we can remove this comment
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    columns,
    data,
    getCoreRowModel: getCoreRowModel(), // basic rendering
    getFilteredRowModel: getFilteredRowModel(), // enable filtering feature
    getPaginationRowModel:
      pagination === 'off' ? undefined : getPaginationRowModel(), // enable pagination calculations
    getSortedRowModel: getSortedRowModel(), // enable sorting feature
    initialState: {
      ...initialState,
    },
  });

  const filterJustifyClass =
    globalFilter === 'left'
      ? 'justify-start'
      : globalFilter === 'right'
        ? 'justify-end'
        : '';

  const showPaginationControls =
    pagination === 'on' || (pagination === 'auto' && table.getPageCount() > 1);

  const showFooter = hasAnyFooter(columns);

  return (
    <div className="space-y-4">
      {globalFilter !== 'none' && (
        <div className={`flex w-full ${filterJustifyClass}`}>
          <label className="input input-bordered flex items-center gap-2 w-full max-w-sm">
            <svg
              className="h-[1em] opacity-50"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <g
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
              >
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.3-4.3"></path>
              </g>
            </svg>
            <input
              className="grow"
              onChange={(e) => table.setGlobalFilter(e.target.value)}
              placeholder="Search all columns..."
              type="text"
              value={table.getState().globalFilter ?? ''}
            />
            {table.getState().globalFilter && (
              <button
                className="btn btn-ghost btn-sm btn-circle"
                onClick={() => table.setGlobalFilter('')}
                type="button"
              >
                <svg
                  className="h-4 w-4"
                  fill="currentColor"
                  viewBox="0 0 16 16"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                </svg>
              </button>
            )}
          </label>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="table walter-table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    className={
                      header.column.getCanSort()
                        ? 'cursor-pointer select-none'
                        : undefined
                    }
                    colSpan={header.colSpan}
                    key={header.id}
                    onClick={
                      header.column.getCanSort()
                        ? header.column.getToggleSortingHandler()
                        : undefined
                    }
                  >
                    <div className="flex flex-nowrap items-center gap-1 w-full">
                      <div className="flex-1 min-w-0">
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </div>
                      {header.column.getIsSorted() === 'asc' ? (
                        <span
                          aria-label="Sorted ascending"
                          className="shrink-0"
                        >
                          🔼
                        </span>
                      ) : header.column.getIsSorted() === 'desc' ? (
                        <span
                          aria-label="Sorted descending"
                          className="shrink-0"
                        >
                          🔽
                        </span>
                      ) : null}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {showFooter && (
            <tfoot>
              {table.getFooterGroups().map((footerGroup) => (
                <tr className={footerRowClassName} key={footerGroup.id}>
                  {footerGroup.headers.map((header) => (
                    <td colSpan={header.colSpan} key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.footer,
                            header.getContext()
                          )}
                    </td>
                  ))}
                </tr>
              ))}
            </tfoot>
          )}
        </table>
        {showPaginationControls && (
          <div className="flex justify-end space-x-2 py-2">
            <button
              className="btn btn-xs"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
              type="button"
            >
              Previous
            </button>
            <button
              className="btn btn-xs"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
              type="button"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
