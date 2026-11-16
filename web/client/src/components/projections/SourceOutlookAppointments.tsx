import { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/shared/DataTable.tsx';
import { fundingMonthLabel } from '@/components/projections/fundingTimelineDates.ts';
import { formatProjectionCurrency as money } from '@/components/projections/projectionFormatting.ts';
import { SourceAppointmentDetails } from '@/components/projections/SourceAppointmentDetails.tsx';
import { getSourceForecastWindow } from '@/lib/piProjection.ts';
import type {
  ProjectionNavigation,
  ProjectionResults,
} from '@/lib/projectionWorkspace.ts';
import type {
  ProjectionAppointment,
  ProjectionFundingSource,
} from '@/queries/projections.ts';

type CostComponent = 'salary' | 'fringe' | 'fees';
interface StaffRow {
  adjustment?: boolean;
  appointment?: ProjectionAppointment;
  component?: CostComponent;
  description?: string;
  label: string;
  summary?: boolean;
  values: Map<string, number>;
}
const components: { key: CostComponent; label: string }[] = [
  { key: 'salary', label: 'Salary' },
  { key: 'fringe', label: 'Fringe benefits' },
  { key: 'fees', label: 'Fee remission' },
];
const sum = (values: Iterable<number>) =>
  [...values].reduce((total, value) => total + value, 0);
const amount = (value: number | null) => (
  <span className="block text-right whitespace-nowrap tabular-nums">
    {value === null ? '—' : money(value)}
  </span>
);

export function SourceOutlookAppointments({
  appointments,
  onNavigate,
  results,
  source,
  sourceIdentity,
}: {
  appointments: ProjectionAppointment[];
  onNavigate: (location: ProjectionNavigation) => void;
  results: ProjectionResults;
  source: ProjectionFundingSource;
  sourceIdentity: string;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [adjustmentExpanded, setAdjustmentExpanded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const funded = appointments.filter((appointment) =>
    appointment.allocations.some(
      ({ fundingSourceId }) => fundingSourceId === source.id
    )
  );
  const selected = funded.find(({ id }) => id === selectedId);
  const window = getSourceForecastWindow(source, results.forecastWindow);
  const months: string[] = [];
  const date = new Date(`${results.forecastWindow.startMonth}-01T00:00:00Z`);
  while (date.toISOString().slice(0, 7) <= results.forecastWindow.endMonth) {
    months.push(date.toISOString().slice(0, 7));
    date.setUTCMonth(date.getUTCMonth() + 1);
  }
  const eligible = (month: string) =>
    !window.isBeyondForecast && month >= window.startMonth;
  const costs = results.appointmentCosts.filter(
    ({ fundingSourceId }) => fundingSourceId === source.id
  );
  const appointmentRows = funded.map(
    (appointment): StaffRow => ({
      appointment,
      description: [
        appointment.title,
        appointment.positionNumber &&
        funded.some(
          (other) =>
            other.id !== appointment.id && other.name === appointment.name
        )
          ? `Position ${appointment.positionNumber}`
          : null,
      ]
        .filter(Boolean)
        .join(' · '),
      label: appointment.name,
      values: new Map(
        months.map((month) => [
          month,
          sum(
            costs
              .filter(
                (cost) =>
                  cost.appointmentId === appointment.id && cost.month === month
              )
              .map(({ fees, fringe, salary }) => salary + fringe + fees)
          ),
        ])
      ),
    })
  );
  const rows = appointmentRows.flatMap((row): StaffRow[] =>
    row.appointment!.id !== selectedId
      ? [row]
      : [
          row,
          ...components.map(
            ({ key, label }): StaffRow => ({
              component: key,
              label,
              values: new Map(
                months.map((month) => [
                  month,
                  sum(
                    costs
                      .filter(
                        (cost) =>
                          cost.appointmentId === selectedId &&
                          cost.month === month
                      )
                      .map((cost) => cost[key])
                  ),
                ])
              ),
            })
          ),
        ]
  );
  const estimatesByMonth = new Map(
    months.map((month) => [
      month,
      sum(appointmentRows.map(({ values }) => values.get(month) ?? 0)),
    ])
  );
  // Reconciliation belongs to the source, never to an individual appointment.
  const sourceAdjustments = results.personnelAdjustments.filter(
    (adjustment) => adjustment.fundingSourceId === source.id
  );
  const adjustmentValues = (component?: 'salary' | 'fringe') =>
    new Map(
      months.map((month) => [
        month,
        sum(
          sourceAdjustments
            .filter((adjustment) => adjustment.month === month)
            .map((adjustment) =>
              component
                ? adjustment[component]
                : adjustment.salary + adjustment.fringe
            )
        ),
      ])
    );
  const adjustmentsByMonth = adjustmentValues();
  const hasAdjustment = sourceAdjustments.some(
    ({ fringe, month, salary }) =>
      months.includes(month) && (salary !== 0 || fringe !== 0)
  );
  if (hasAdjustment) {
    rows.push(
      {
        label: 'Estimated personnel costs',
        summary: true,
        values: estimatesByMonth,
      },
      {
        adjustment: true,
        label: 'Starting-month adjustment',
        summary: true,
        values: adjustmentsByMonth,
      }
    );
    if (adjustmentExpanded) {
      rows.push(
        ...(['salary', 'fringe'] as const).map((component) => ({
          component,
          label:
            component === 'salary' ? 'Salary adjustment' : 'Fringe adjustment',
          values: adjustmentValues(component),
        }))
      );
    }
  }
  const totalByMonth = new Map(
    months.map((month) => [
      month,
      (estimatesByMonth.get(month) ?? 0) + (adjustmentsByMonth.get(month) ?? 0),
    ])
  );
  const columns: ColumnDef<StaffRow>[] = [
    {
      cell: ({ row: { original: row } }) => (
        <div className="min-w-28 max-w-32 whitespace-normal break-words sm:min-w-44 sm:max-w-60">
          {row.appointment ? (
            <>
              <button
                aria-expanded={row.appointment.id === selectedId}
                className="inline-flex max-w-full items-start gap-1 text-left font-semibold hover:underline"
                onClick={() =>
                  setSelectedId(
                    row.appointment!.id === selectedId
                      ? null
                      : row.appointment!.id
                  )
                }
                type="button"
              >
                {row.appointment.id === selectedId ? (
                  <ChevronDownIcon
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0"
                  />
                ) : (
                  <ChevronRightIcon
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0"
                  />
                )}
                <span>{row.label}</span>
              </button>
              {row.description && (
                <span className="mt-1 block text-xs font-normal text-base-content/70">
                  {row.description}
                </span>
              )}
            </>
          ) : row.adjustment ? (
            <button
              aria-expanded={adjustmentExpanded}
              className="inline-flex items-start gap-1 text-left hover:underline"
              onClick={() => setAdjustmentExpanded(!adjustmentExpanded)}
              type="button"
            >
              {adjustmentExpanded ? (
                <ChevronDownIcon
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
              ) : (
                <ChevronRightIcon
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
              )}
              {row.label}
            </button>
          ) : (
            <span className="pl-3 font-normal">{row.label}</span>
          )}
        </div>
      ),
      footer: 'Additional personnel forecast',
      header: 'Appointment',
      id: 'appointment',
      size: 240,
    },
    ...months.map(
      (month): ColumnDef<StaffRow> => ({
        cell: ({ row }) =>
          amount(
            eligible(month) ? (row.original.values.get(month) ?? 0) : null
          ),
        footer: () =>
          amount(eligible(month) ? (totalByMonth.get(month) ?? 0) : null),
        header: fundingMonthLabel(month),
        id: month,
        size: 115,
      })
    ),
    {
      cell: ({ row }) => amount(sum(row.original.values.values())),
      footer: () => amount(sum(totalByMonth.values())),
      header: 'Total',
      id: 'total',
      size: 130,
    },
  ];
  const details = selected && (
    <SourceAppointmentDetails
      appointment={selected}
      onNavigate={onNavigate}
      results={results}
      sourceId={source.id}
    />
  );
  return (
    <section aria-label="Staff costs by month" className="space-y-3">
      <h3 className="font-semibold">Staff costs by month</h3>
      <p className="text-sm text-base-content/70">
        Estimated salary, fringe and fee remission for this funding source.
        Expand a name for the breakdown and editors. Fringe includes CBR and
        leave accrual.
      </p>
      {funded.length === 0 && (
        <p className="text-sm">No appointments allocated to this source.</p>
      )}
      {rows.length > 0 ? (
        <>
          <DataTable
            caption={`${sourceIdentity} staff costs by month`}
            columns={columns}
            data={rows}
            footerRowClassName="font-semibold"
            getRowProps={({ original }) =>
              original.component
                ? { className: 'bg-base-200/40' }
                : original.summary
                  ? { className: 'border-t border-base-300 font-medium' }
                  : {}
            }
            globalFilter="none"
            onOverlayActiveChange={setFullscreen}
            pagination="off"
            rowHeaderColumnId="appointment"
            tableClassName="table-sm [&_th]:align-top [&_thead_th]:text-right [&_th:first-child]:text-left [&_tr>:first-child]:w-32! [&_tr>:first-child]:min-w-32 [&_tr>:first-child]:max-w-32 sm:[&_tr>:first-child]:w-60! sm:[&_tr>:first-child]:max-w-60 [&_tr>:first-child]:sticky [&_tr>:first-child]:left-0 [&_tr>:first-child]:z-10 [&_tr>:first-child]:bg-base-100 [&_tfoot_td]:bg-base-200"
            tableLeadingActions={
              <div className="min-w-0 w-full space-y-2">
                {fullscreen ? (
                  <p className="text-sm break-words">
                    <span className="font-semibold">{sourceIdentity}</span> ·
                    Staff costs by month
                  </p>
                ) : (
                  <p className="text-sm text-base-content/70">
                    {funded.length}{' '}
                    {funded.length === 1 ? 'appointment' : 'appointments'} ·
                    This funding source only
                  </p>
                )}
                {hasAdjustment && (
                  <p className="text-xs text-base-content/70">
                    Staff rows show full-month estimates. The adjustment
                    accounts for{' '}
                    {fundingMonthLabel(source.capturedAt.slice(0, 7))} salary
                    and fringe already included in the starting balance.
                  </p>
                )}
                {details && (
                  <div className="max-h-52 overflow-auto">{details}</div>
                )}
              </div>
            }
          />
        </>
      ) : null}
    </section>
  );
}
