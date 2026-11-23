import {
  BanknotesIcon,
  UserGroupIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useMemo } from 'react';
import { ProjectionDialog } from '@/components/projections/ProjectionDialog.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import {
  buildPlanChanges,
  changeDate,
  changePercent,
  type AssumptionChange,
  type FundingChange,
  type StaffingChange,
} from '@/lib/projectionChanges.ts';
import type { AllocationChangePeriod } from '@/lib/projectionAllocations.ts';
import type { ProjectionDraft } from '@/queries/projections.ts';

function Assumptions({
  added,
  label,
  rows,
}: {
  added: boolean;
  label: string;
  rows: AssumptionChange[];
}) {
  if (!rows.length) {
    return null;
  }
  return (
    <table aria-label={label} className="table table-sm mt-3 w-full">
      <thead>
        <tr>
          <th>{label}</th>
          {!added && <th>Original</th>}
          <th>Planned</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th className="font-normal" scope="row">
              {row.label}
            </th>
            {!added && <td>{row.original ?? '—'}</td>}
            <td className="font-semibold">{row.planned ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function periodLabel({ endDate, startDate }: AllocationChangePeriod) {
  if (startDate && endDate) {
    return changeDate(startDate) + ' – ' + changeDate(endDate);
  }
  if (startDate) {
    return 'From ' + changeDate(startDate);
  }
  if (endDate) {
    return 'Through ' + changeDate(endDate);
  }
  return 'All appointment dates';
}

function StaffingCard({
  change,
  sourceNames,
}: {
  change: StaffingChange;
  sourceNames: Map<number, string>;
}) {
  const { allocations, appointment, assumptions, kind } = change;
  return (
    <article className="min-w-0 rounded-lg border border-main-border p-4">
      <h4 className="text-lg font-semibold wrap-anywhere">
        {appointment.name || `Appointment ${appointment.id}`}
      </h4>
      <p className="text-sm wrap-anywhere text-base-content/75">
        {[
          appointment.title,
          appointment.jobCode && 'Job ' + appointment.jobCode,
          appointment.positionNumber &&
            'Position ' + appointment.positionNumber,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {kind === 'added' && (
        <p className="mt-2 font-semibold">New appointment</p>
      )}
      {kind === 'excluded' && <p className="mt-2">Excluded from this plan</p>}
      <Assumptions
        added={kind === 'added'}
        label="Assumption"
        rows={assumptions}
      />
      {allocations.length > 0 && (
        <details className="mt-3 border-t border-main-border pt-3">
          <summary className="cursor-pointer font-semibold text-primary">
            Funding allocation
          </summary>
          {allocations.map((period) => (
            <table
              className="table table-sm mt-3 w-full"
              key={period.startDate ?? 'start'}
            >
              <caption className="text-left font-semibold">
                {periodLabel(period)}
              </caption>
              <thead>
                <tr>
                  <th>Funding source</th>
                  {kind !== 'added' && <th>Original</th>}
                  <th>Planned</th>
                </tr>
              </thead>
              <tbody>
                {period.shares.map((share) => (
                  <tr key={share.fundingSourceId ?? 'outside'}>
                    <th className="font-normal wrap-anywhere" scope="row">
                      {share.fundingSourceId === null
                        ? 'Outside this plan'
                        : sourceNames.get(share.fundingSourceId)}
                    </th>
                    {kind !== 'added' && (
                      <td>{changePercent(share.original)}</td>
                    )}
                    <td className="font-semibold">
                      {changePercent(share.planned)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </details>
      )}
    </article>
  );
}

function budgetSummary(change: FundingChange) {
  if (change.plannedSource) {
    return 'Proposed funding';
  }
  if (change.total && change.total.adjustment > 0) {
    return 'Overall funding increased';
  }
  if (change.total && change.total.adjustment < 0) {
    return 'Overall funding decreased';
  }
  if (change.categories.some((row) => row.adjustment !== 0)) {
    return 'Budget redistributed across categories';
  }
  return 'Category budget established';
}

function FundingCard({ change }: { change: FundingChange }) {
  const { categories, dates, plannedSource, source, total } = change;
  return (
    <article className="min-w-0 rounded-lg border border-main-border p-4">
      <h4 className="text-lg font-semibold wrap-anywhere">{source.name}</h4>
      <p className="text-sm wrap-anywhere text-base-content/75">
        {[
          source.projectNumber && 'Project ' + source.projectNumber,
          source.taskNumber && 'Task ' + source.taskNumber,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {plannedSource && (
        <p className="mt-2 font-semibold">New planned funding source</p>
      )}
      {total && (
        <div className="mt-4 overflow-x-auto">
          <table className="table table-sm w-full tabular-nums">
            <caption className="mb-2 text-left font-semibold">
              {budgetSummary(change)}
            </caption>
            <thead>
              <tr>
                <th>Category</th>
                {!plannedSource && (
                  <>
                    <th className="text-right">Original available</th>
                    <th className="text-right">Net adjustment</th>
                  </>
                )}
                <th className="text-right">
                  {plannedSource ? 'Proposed available' : 'Revised available'}
                </th>
              </tr>
            </thead>
            <tbody>
              {[...categories, total].map((row) => (
                <tr
                  className={
                    row === total ? 'bg-base-200 font-semibold' : undefined
                  }
                  key={row.category}
                >
                  <th className="wrap-anywhere" scope="row">
                    {row.category}
                  </th>
                  {!plannedSource && (
                    <>
                      <td className="text-right">
                        {row.original === null
                          ? 'No budget'
                          : formatCurrency(row.original)}
                      </td>
                      <td className="text-right">
                        {row.adjustment > 0 ? '+' : ''}
                        {formatCurrency(row.adjustment)}
                      </td>
                    </>
                  )}
                  <td className="text-right">{formatCurrency(row.revised)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Assumptions added={plannedSource} label="Funding dates" rows={dates} />
    </article>
  );
}

export function PlanChangesDialog({
  dirty,
  draft,
  onClose,
}: {
  dirty: boolean;
  draft: ProjectionDraft;
  onClose: () => void;
}) {
  const report = useMemo(() => buildPlanChanges(draft), [draft]);
  const count = report.staffing.length;
  const sources = report.fundingSourceCount;
  return (
    <ProjectionDialog
      header={(id) => (
        <>
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-2xl font-semibold" id={id}>
              Plan changes
            </h2>
            <button
              aria-label="Close plan changes"
              className="btn btn-ghost btn-sm btn-square"
              onClick={onClose}
              type="button"
            >
              <XMarkIcon aria-hidden="true" className="size-5" />
            </button>
          </div>
          <p className="mt-1 text-base-content/75">
            Compared with inputs captured {changeDate(draft.seededAt)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="font-semibold">
              {count} {count === 1 ? 'appointment' : 'appointments'} and{' '}
              {sources} funding {sources === 1 ? 'source' : 'sources'} affected
            </p>
            {dirty && (
              <span className="rounded-full bg-warning/15 px-3 py-1 text-sm font-semibold">
                Includes unsaved changes
              </span>
            )}
          </div>
        </>
      )}
      onClose={onClose}
      title="Plan changes"
      wide
    >
      {!count && !report.funding.length && (
        <p>No staffing or funding changes from the captured inputs.</p>
      )}
      {count > 0 && (
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-xl font-semibold">
            <UserGroupIcon aria-hidden="true" className="size-5" />
            Staffing
          </h3>
          {report.staffing.map((change) => (
            <StaffingCard
              change={change}
              key={change.appointment.id}
              sourceNames={report.sourceNames}
            />
          ))}
        </section>
      )}
      {report.funding.length > 0 && (
        <section className={count ? 'mt-6 space-y-3' : 'space-y-3'}>
          <h3 className="flex items-center gap-2 text-xl font-semibold">
            <BanknotesIcon aria-hidden="true" className="size-5" />
            Funding
          </h3>
          {report.funding.map((change) => (
            <FundingCard change={change} key={change.source.id} />
          ))}
        </section>
      )}
    </ProjectionDialog>
  );
}
