import { useMemo } from 'react';
import type { ManagedPiRecord } from '@/queries/project.ts';
import { DataTable } from '@/shared/DataTable.tsx';
import { Link } from '@tanstack/react-router';
import { createColumnHelper } from '@tanstack/react-table';
import {
  ClipboardDocumentListIcon,
  PresentationChartLineIcon,
} from '@heroicons/react/24/outline';
import { useFeatureFlagsQuery } from '@/queries/featureFlags.ts';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';
import { tooltipDefinitions } from '@/shared/tooltips.ts';

const columnHelper = createColumnHelper<ManagedPiRecord>();

type PortfolioDestination = '/projects/$iamId/' | '/projections/$iamId';

const createColumns = (
  to: PortfolioDestination,
  projectionsEnabled: boolean
) => [
  columnHelper.accessor('name', {
    cell: (info) => {
      const iamId = info.row.original.iamId;
      if (!iamId) {
        return (
          <div
            aria-disabled="true"
            className="flex h-20 flex-col justify-center gap-1 rounded border border-main-border bg-base-200 p-3 text-base-content/60"
          >
            <span className="truncate">{info.getValue()}</span>
            <span className="text-xs">Campus identity unavailable</span>
          </div>
        );
      }

      return (
        <div className="flex h-20 items-center gap-2 rounded border border-main-border p-3">
          <Link
            className="link link-hover line-clamp-2 min-w-0 flex-1"
            params={{ iamId }}
            to={to}
          >
            {info.getValue()}
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            <TooltipLabel
              asChild
              label={
                <Link
                  aria-label={`View projects for ${info.getValue()}`}
                  className="btn btn-ghost btn-sm btn-square"
                  params={{ iamId }}
                  to="/projects/$iamId/"
                >
                  <ClipboardDocumentListIcon
                    aria-hidden="true"
                    className="size-5"
                  />
                </Link>
              }
              tooltip={tooltipDefinitions.viewPiProjects}
            />
            {projectionsEnabled && (
              <TooltipLabel
                asChild
                label={
                  <Link
                    aria-label={`View projections for ${info.getValue()}`}
                    className="btn btn-ghost btn-sm btn-square"
                    params={{ iamId }}
                    to="/projections/$iamId"
                  >
                    <PresentationChartLineIcon
                      aria-hidden="true"
                      className="size-5"
                    />
                  </Link>
                }
                tooltip={tooltipDefinitions.viewPiProjections}
              />
            )}
          </div>
        </div>
      );
    },
    header: 'PI Name',
  }),
];

interface PrincipalInvestigatorsTableProps {
  pis: ManagedPiRecord[];
  to?: PortfolioDestination;
}

export function PrincipalInvestigatorsTable({
  pis,
  to = '/projects/$iamId/',
}: PrincipalInvestigatorsTableProps) {
  const { data: featureFlags } = useFeatureFlagsQuery();
  const projectionsEnabled =
    import.meta.env.MODE === 'demo' ||
    Boolean(featureFlags?.projectionsEnabled);
  const columns = useMemo(
    () => createColumns(to, projectionsEnabled),
    [to, projectionsEnabled]
  );
  if (pis.length === 0) {
    return (
      <p className="text-base-content/70 mt-8">
        No principal investigators found.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <DataTable
        columns={columns}
        data={pis}
        defaultColumnSize={220}
        filterPlaceholder="Search PIs..."
        globalFilter="left"
        initialState={{ pagination: { pageSize: 25 } }}
        tableClassName="table-cardgrid"
      />
    </div>
  );
}
