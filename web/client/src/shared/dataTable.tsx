'use no memo';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
} from '@heroicons/react/24/outline';
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
import { useLockBodyScroll } from '@/shared/hooks/useLockBodyScroll.ts';

// TanStack Table types `TableOptions.columns` as `ColumnDef<TData, any>[]` because
// tables commonly mix column value types (string/number/etc) in a single array.
// We don't like the use of `any`, so a good compromise is to create an alias here so we only have to suppress the linter once.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DataTableColumnDef<TData extends object> = ColumnDef<TData, any>;
type DataTableColumns<TData extends object> = Array<DataTableColumnDef<TData>>;

type OverlayRect = { height: number; left: number; top: number; width: number };
type ExpandPhase = 'inline' | 'opening' | 'expanded' | 'closing';

function rectFromDomRect(rect: DOMRect): OverlayRect {
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}

function isUsableRect(rect: OverlayRect): boolean {
  return (
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function getExpandedRect(marginPx: number): OverlayRect {
  return {
    height: Math.max(0, window.innerHeight - 2 * marginPx),
    left: marginPx,
    top: marginPx,
    width: Math.max(0, window.innerWidth - 2 * marginPx),
  };
}

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
  globalFilter?: 'left' | 'right' | 'none'; // Controls the position of the search box
  initialState?: InitialTableState; // Optional initial state for the table, use for stuff like setting page size or sorting
  pagination?: 'auto' | 'on' | 'off'; // 'auto' shows controls only when needed; 'off' disables pagination entirely
  // ...any other props, initial state?, export? pages? filter? sorting?
}

export const DataTable = <TData extends object>({
  columns,
  data,
  expandable = true,
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

  const prefersReducedMotion = useMemo(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return false;
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const [expandPhase, setExpandPhase] = useState<ExpandPhase>('inline');
  const [overlayRect, setOverlayRect] = useState<OverlayRect | null>(null);
  const [placeholderHeight, setPlaceholderHeight] = useState<number | null>(
    null
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const placeholderRef = useRef<HTMLDivElement | null>(null);
  const expandButtonRef = useRef<HTMLButtonElement | null>(null);
  const rafIdsRef = useRef<number[]>([]);

  const isOverlay = expandPhase !== 'inline';
  useLockBodyScroll(isOverlay);

  useEffect(() => {
    return () => {
      if (typeof window === 'undefined') {
        return;
      }
      for (const rafId of rafIdsRef.current) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, []);

  const finalizeClose = useCallback(() => {
    setExpandPhase('inline');
    setOverlayRect(null);
    setPlaceholderHeight(null);
    expandButtonRef.current?.focus();
  }, []);

  const openExpanded = useCallback(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    const fromRect = rectFromDomRect(el.getBoundingClientRect());
    setPlaceholderHeight(el.offsetHeight);

    if (prefersReducedMotion || !isUsableRect(fromRect)) {
      setOverlayRect(getExpandedRect(16));
      setExpandPhase('expanded');
      return;
    }

    setOverlayRect(fromRect);
    setExpandPhase('opening');

    for (const rafId of rafIdsRef.current) {
      window.cancelAnimationFrame(rafId);
    }
    rafIdsRef.current = [];

    const raf1 = window.requestAnimationFrame(() => {
      const raf2 = window.requestAnimationFrame(() => {
        setOverlayRect(getExpandedRect(16));
      });
      rafIdsRef.current.push(raf2);
    });
    rafIdsRef.current.push(raf1);
  }, [prefersReducedMotion]);

  const closeExpanded = useCallback(() => {
    if (prefersReducedMotion) {
      finalizeClose();
      return;
    }

    const placeholderEl = placeholderRef.current;
    if (!placeholderEl) {
      finalizeClose();
      return;
    }

    const toRect = rectFromDomRect(placeholderEl.getBoundingClientRect());
    if (!isUsableRect(toRect)) {
      finalizeClose();
      return;
    }

    setOverlayRect(toRect);
    setExpandPhase('closing');
  }, [finalizeClose, prefersReducedMotion]);

  const toggleExpanded = useCallback(() => {
    if (!expandable) {
      return;
    }
    if (isOverlay) {
      closeExpanded();
    } else {
      openExpanded();
    }
  }, [closeExpanded, expandable, isOverlay, openExpanded]);

  useEffect(() => {
    if (!isOverlay) {
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') {
        return;
      }
      e.preventDefault();
      closeExpanded();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeExpanded, isOverlay]);

  useEffect(() => {
    if (expandPhase !== 'expanded') {
      return;
    }

    const onResize = () => {
      setOverlayRect(getExpandedRect(16));
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [expandPhase]);

  const overlayStyle =
    isOverlay && overlayRect
      ? {
          height: overlayRect.height,
          left: overlayRect.left,
          top: overlayRect.top,
          width: overlayRect.width,
        }
      : undefined;

  return (
    <>
      {isOverlay ? (
        <div
          aria-hidden="true"
          className="fixed inset-0 bg-black/40 z-90"
          data-testid="datatable-backdrop"
          onClick={closeExpanded}
        />
      ) : null}

      {isOverlay ? (
        <div
          aria-hidden="true"
          ref={placeholderRef}
          style={{ height: placeholderHeight ?? undefined }}
        />
      ) : null}

      <div
        className={[
          'flex flex-col gap-4 w-full',
          isOverlay
            ? [
                'fixed z-100 bg-base-100 rounded-box shadow-xl p-4 min-h-0',
                prefersReducedMotion
                  ? 'transition-none'
                  : 'transition-[top,left,width,height] duration-300 ease-in-out',
              ].join(' ')
            : '',
        ].join(' ')}
        onTransitionEnd={(e) => {
          if (e.target !== e.currentTarget) {
            return;
          }
          if (expandPhase === 'opening') {
            setExpandPhase('expanded');
            return;
          }
          if (expandPhase === 'closing') {
            finalizeClose();
          }
        }}
        ref={containerRef}
        style={overlayStyle}
      >
        {(globalFilter !== 'none' || expandable) && (
          <div className="grid grid-cols-[1fr_auto] items-center gap-2">
            {globalFilter !== 'none' ? (
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
            ) : (
              <div />
            )}

            {expandable ? (
              <button
                aria-label={isOverlay ? 'Collapse table' : 'Expand table'}
                className="btn btn-ghost btn-sm btn-square"
                onClick={toggleExpanded}
                ref={expandButtonRef}
                title={isOverlay ? 'Collapse table' : 'Expand table'}
                type="button"
              >
                {isOverlay ? (
                  <ArrowsPointingInIcon className="h-5 w-5" />
                ) : (
                  <ArrowsPointingOutIcon className="h-5 w-5" />
                )}
              </button>
            ) : null}
          </div>
        )}

        <div
          className={
            isOverlay ? 'flex-1 min-h-0 overflow-auto' : 'overflow-x-auto'
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
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
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
        </div>

        {showPaginationControls && (
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
        )}
      </div>
    </>
  );
};
