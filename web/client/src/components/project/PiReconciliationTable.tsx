import { type MouseEvent, useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { createColumnHelper } from '@tanstack/react-table';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { ReconciliationTable } from '@/components/reconciliation/ReconciliationTable.tsx';
import type { ManagedPiRecord } from '@/queries/project.ts';
import { DataTable } from '@/shared/DataTable.tsx';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';
import type { PiReconciliationSummary } from './usePiReconciliation.ts';

type PiRow = ManagedPiRecord & { summary: PiReconciliationSummary | undefined };

const loadErrorLabel = "Couldn't load reconciliation";

// Links inside a clickable row navigate without toggling the row.
const stopRowToggle = (e: MouseEvent) => e.stopPropagation();

function ExpandIcon({ isExpanded }: { isExpanded: boolean }) {
  return isExpanded ? (
    <ChevronUpIcon aria-hidden="true" className="w-4 h-4 shrink-0" />
  ) : (
    <ChevronDownIcon aria-hidden="true" className="w-4 h-4 shrink-0" />
  );
}

function ReconciliationBadge({
  summary,
}: {
  summary: PiReconciliationSummary | undefined;
}) {
  if (!summary || summary.status === 'loading') {
    return (
      <span
        aria-label="Loading reconciliation"
        className="loading loading-spinner loading-xs"
        role="status"
      />
    );
  }

  if (summary.status === 'error') {
    return (
      <TooltipLabel
        asChild
        label={<span aria-label={loadErrorLabel}>-</span>}
        tooltip={loadErrorLabel}
      />
    );
  }

  if (summary.issueCount === 0) {
    return null;
  }

  return (
    <span className="badge badge-sm badge-warning gap-1">
      <ExclamationTriangleIcon aria-hidden="true" className="h-4 w-4" />
      {`${summary.issueCount} reconciliation ${
        summary.issueCount === 1 ? 'issue' : 'issues'
      }`}
    </span>
  );
}

function PiProjectsPanel({
  summary,
}: {
  summary: PiReconciliationSummary | undefined;
}) {
  if (!summary || summary.status === 'loading') {
    return (
      <p className="text-sm text-base-content/70">Loading reconciliation…</p>
    );
  }

  if (summary.status === 'error') {
    return (
      <p className="text-sm text-error">
        {"Couldn't load reconciliation for this PI."}
      </p>
    );
  }

  if (summary.projects.length === 0) {
    return (
      <p className="text-sm text-base-content/70">No internal projects.</p>
    );
  }

  const records = summary.projects.flatMap((p) => p.records);
  if (records.length === 0) {
    return (
      <p className="text-sm text-base-content/70">No reconciliation data.</p>
    );
  }

  return <ReconciliationTable projectFirst records={records} />;
}

const piColumnHelper = createColumnHelper<PiRow>();

const piColumns = [
  piColumnHelper.accessor('name', {
    cell: (info) => (
      <div className="flex items-center gap-2">
        <ExpandIcon isExpanded={info.row.getIsExpanded()} />
        <Link
          className="link"
          onClick={stopRowToggle}
          params={{ iamId: info.row.original.iamId ?? '' }}
          to="/projects/$iamId/"
        >
          {info.getValue()}
        </Link>
      </div>
    ),
    header: 'PI Name',
    size: 400,
  }),
  piColumnHelper.display({
    cell: (info) => <ReconciliationBadge summary={info.row.original.summary} />,
    header: 'Reconciliation',
    id: 'reconciliation',
  }),
];

interface PiReconciliationTableProps {
  byPi: Map<string, PiReconciliationSummary>;
  pis: ManagedPiRecord[];
}

export function PiReconciliationTable({
  byPi,
  pis,
}: PiReconciliationTableProps) {
  const rows = useMemo(
    () => pis.map((pi) => ({ ...pi, summary: byPi.get(pi.employeeId) })),
    [byPi, pis]
  );

  return (
    <div className="mt-4">
      <DataTable
        columns={piColumns}
        data={rows}
        defaultColumnSize={220}
        filterPlaceholder="Search PIs..."
        getRowProps={(row) => ({
          className: 'cursor-pointer hover:bg-base-200',
          onClick: () => row.toggleExpanded(),
        })}
        globalFilter="left"
        pagination="off"
        renderSubComponent={({ row }) => (
          <PiProjectsPanel summary={row.original.summary} />
        )}
        subComponentRowClassName="pivot-row"
      />
    </div>
  );
}
