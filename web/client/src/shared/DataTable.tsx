'use no memo';

import { Fragment, type HTMLAttributes, type ReactNode } from 'react';
import {
  ArrowDownIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  ArrowUpIcon,
} from '@heroicons/react/24/outline';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  InitialTableState,
  type Row,
  useReactTable,
} from '@tanstack/react-table';
import { useExpandableOverlay } from '@/shared/hooks/useExpandableOverlay.ts';

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
  expandable?: boolean;
  footerRowClassName?: string;
  getRowCanExpand?: (row: Row<TData>) => boolean; // Default is `() => true` when `renderSubComponent` is provided
  getRowProps?: (row: Row<TData>) => HTMLAttributes<HTMLTableRowElement>;
  globalFilter?: 'left' | 'right' | 'none'; // Controls the position of the search box
  initialState?: InitialTableState; // Optional initial state for the table, use for stuff like setting page size or sorting
  pagination?: 'auto' | 'on' | 'off'; // 'auto' shows controls only when needed; 'off' disables pagination entirely
  renderSubComponent?: (props: { row: Row<TData> }) => ReactNode;
  subComponentRowClassName?: string;
  tableActions?: ReactNode;
}

export const DataTable = <TData extends object>({
  columns,
  data,
  expandable = true,
  footerRowClassName,
  getRowCanExpand,
  getRowProps,
  globalFilter = 'right',
  initialState,
  pagination = 'auto',
  renderSubComponent,
  subComponentRowClassName,
  tableActions,
}: DataTableProps<TData>) => {
  const rowExpansionEnabled = renderSubComponent !== undefined;

  // see note in https://tanstack.com/table/latest/docs/installation#react-table.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    columnResizeMode: 'onChange',
    columns,
    data,
    defaultColumn: {
      maxSize: 600,
      minSize: 60,
      size: 100,
    },
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: rowExpansionEnabled
      ? getExpandedRowModel()
      : undefined,
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel:
      pagination === 'off' ? undefined : getPaginationRowModel(),
    getRowCanExpand: rowExpansionEnabled
      ? (getRowCanExpand ?? (() => true))
      : undefined,
    getSortedRowModel: getSortedRowModel(),
    initialState: {
      ...initialState,
    },
  });

  const {
    canAnimateRect,
    closeExpanded,
    containerRef,
    expandButtonRef,
    handleContainerTransitionEnd,
    isOverlayActive,
    overlayStyle,
    placeholderHeight,
    placeholderRef,
    prefersReducedMotion,
    toggleExpanded,
  } = useExpandableOverlay({
    enabled: expandable,
  });

  const expandableRows = rowExpansionEnabled
    ? table.getPrePaginationRowModel().rows.filter((row) => row.getCanExpand())
    : [];
  const hasExpandableRows = expandableRows.length > 0;
  const areAllExpandableRowsExpanded =
    hasExpandableRows && expandableRows.every((row) => row.getIsExpanded());
  const shouldShowToolbar =
    globalFilter !== 'none' || expandable || tableActions || (rowExpansionEnabled && hasExpandableRows);
  const showFooter = hasAnyFooter(columns);
  const showPaginationControls =
    pagination === 'on' || (pagination === 'auto' && table.getPageCount() > 1);
  const filterValue = table.getState().globalFilter ?? '';
  const hasFilterValue = filterValue !== '';

  return (
    <>
      {isOverlayActive ? (
        <div
          aria-hidden="true"
          className="fixed inset-0 bg-black/40 z-90"
          data-testid="datatable-backdrop"
          onClick={closeExpanded}
        />
      ) : null}

      {isOverlayActive ? (
        <div
          aria-hidden="true"
          ref={placeholderRef}
          style={{ height: placeholderHeight ?? undefined }}
        />
      ) : null}

      <div
        className={[
          'flex flex-col gap-4 w-full',
          isOverlayActive
            ? [
                'fixed z-100 bg-base-100 rounded-box shadow-xl p-4 min-h-0',
                prefersReducedMotion || !canAnimateRect
                  ? 'transition-none'
                  : 'transition-[top,left,width,height] duration-300 ease-in-out',
              ].join(' ')
            : '',
        ].join(' ')}
        onTransitionEnd={handleContainerTransitionEnd}
        ref={containerRef}
        style={overlayStyle}
      >
        {shouldShowToolbar ? (
          <div className="grid grid-cols-[1fr_auto] items-center gap-2">
            {globalFilter !== 'none' ? (
              <label className="input input-bordered flex items-center gap-2 max-w-sm">
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
                  value={filterValue}
                />
                {hasFilterValue ? (
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
                ) : null}
              </label>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              {tableActions}
              {rowExpansionEnabled && hasExpandableRows ? (
                <button
                  aria-label={
                    areAllExpandableRowsExpanded
                      ? 'Collapse all rows'
                      : 'Expand all rows'
                  }
                  className="btn btn-sm"
                  onClick={() =>
                    table.toggleAllRowsExpanded(!areAllExpandableRowsExpanded)
                  }
                  title={
                    areAllExpandableRowsExpanded
                      ? 'Collapse all rows'
                      : 'Expand all rows'
                  }
                  type="button"
                >
                  {areAllExpandableRowsExpanded ? 'Collapse all' : 'Expand all'}
                </button>
              ) : null}

              {expandable ? (
                <button
                  aria-label={
                    isOverlayActive ? 'Collapse table' : 'Expand table'
                  }
                  className="btn btn-sm btn-square"
                  onClick={toggleExpanded}
                  ref={expandButtonRef}
                  title={isOverlayActive ? 'Collapse table' : 'Expand table'}
                  type="button"
                >
                  {isOverlayActive ? (
                    <ArrowsPointingInIcon className="h-5 w-5" />
                  ) : (
                    <ArrowsPointingOutIcon className="h-5 w-5" />
                  )}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div
          className={
            isOverlayActive ? 'flex-1 min-h-0 overflow-auto' : 'overflow-x-auto'
          }
        >
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
                      style={{ width: header.getSize() }}
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
                            <ArrowUpIcon className="h-3 w-3" />
                          </span>
                        ) : header.column.getIsSorted() === 'desc' ? (
                          <span
                            aria-label="Sorted descending"
                            className="shrink-0"
                          >
                            <ArrowDownIcon className="h-3 w-3" />
                          </span>
                        ) : null}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => {
                const rowProps = getRowProps?.(row);

                return (
                  <Fragment key={row.id}>
                    <tr
                      {...rowProps}
                      className={['', rowProps?.className]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          className="align-top"
                          key={cell.id}
                          style={{ width: cell.column.getSize() }}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </td>
                      ))}
                    </tr>

                    {renderSubComponent && row.getIsExpanded() ? (
                      <tr className={subComponentRowClassName}>
                        <td colSpan={row.getVisibleCells().length}>
                          {renderSubComponent({ row })}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
            {showFooter ? (
              <tfoot>
                {table.getFooterGroups().map((footerGroup) => (
                  <tr className={footerRowClassName} key={footerGroup.id}>
                    {footerGroup.headers.map((header) => (
                      <td
                        colSpan={header.colSpan}
                        key={header.id}
                        style={{ width: header.getSize() }}
                      >
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
            ) : null}
          </table>
        </div>

        {showPaginationControls ? (
          <div className="flex justify-end gap-2">
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
        ) : null}
      </div>
    </>
  );
};
