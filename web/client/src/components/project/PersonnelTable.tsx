import { useId, useMemo, useState } from 'react';
import {
  ChevronDownIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { ExportDataButton } from '@/components/ExportDataButton.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import { formatDate } from '@/lib/date.ts';
import { FUNDING_INFO_UNAVAILABLE } from '@/lib/fundingInfo.ts';
import type { PersonnelRecord } from '@/queries/personnel.ts';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';
import { tooltipDefinitions } from '@/shared/tooltips.ts';

function isEndingSoon(dateStr: string | null): boolean {
  if (!dateStr) {
    return false;
  }
  const endDate = new Date(dateStr);
  const now = new Date();
  const threeMonthsFromNow = new Date(
    now.getFullYear(),
    now.getMonth() + 3,
    now.getDate()
  );
  return endDate <= threeMonthsFromNow && endDate >= now;
}

function safeText(value: string | null | undefined): string {
  return value ?? '';
}

/** One funding entry: a person's earn code lines on it, summed. */
export interface AggregatedDistribution {
  /** Share of the job charged here: sum of earn code share x distribution %. */
  distributionPercent: number;
  fundingEndingSoon: boolean;
  monthlyFringe: number;
  monthlyRate: number;
  monthlyTotal: number;
  /** First line of the entry; carries the project, task, and dates. */
  record: PersonnelRecord;
  /** Unsplit entry: amounts are 0 and must not be shown. */
  salaryUnknown: boolean;
}

export interface AggregatedPosition {
  distributions: AggregatedDistribution[];
  employeeId: string;
  fte: number;
  /** No current entry; shown only with future entries and excluded from totals. */
  isFutureOnly: boolean;
  jobCode: string;
  jobEffectiveDate: string | null;
  jobEndDate: string | null;
  jobEndingSoon: boolean;
  key: string; // employeeId + positionNumber
  monthlyFringe: number;
  monthlyRate: number;
  monthlyTotal: number;
  name: string;
  positionDescription: string;
  positionNumber: string;
  /**
   * Pay is split across earn codes but there is no UCP-310 data to split it,
   * so no salary can be attributed to the project: amounts are 0, hidden, and
   * left out of totals.
   */
  salaryUnknown: boolean;
}

function isSalaryUnknown(record: PersonnelRecord): boolean {
  return record.earnCodeStatus === 'Unsplit';
}

function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((total, item) => total + pick(item), 0);
}

function aggregateDistribution(
  lines: PersonnelRecord[]
): AggregatedDistribution {
  const [record] = lines;
  const salaryUnknown = lines.some(isSalaryUnknown);
  // Cognos lines carry their earn code's share of pay; other sources have none.
  const share = (line: PersonnelRecord) =>
    (line.earnCodeShare ?? 1) * (line.distributionPercent / 100);
  const salary = (line: PersonnelRecord) =>
    line.monthlyRate * line.fte * share(line);
  const monthlyRate = salaryUnknown ? 0 : sum(lines, salary);
  const monthlyFringe = salaryUnknown
    ? 0
    : sum(lines, (line) => salary(line) * line.compositeBenefitRate);
  return {
    distributionPercent: salaryUnknown ? 0 : sum(lines, share) * 100,
    fundingEndingSoon: isEndingSoon(record.fundingEndDate),
    monthlyFringe,
    monthlyRate,
    monthlyTotal: monthlyRate + monthlyFringe,
    record,
    salaryUnknown,
  };
}

/** Groups a position's lines by funding entry, so earn codes show as one total. */
function aggregateDistributions(
  records: PersonnelRecord[]
): AggregatedDistribution[] {
  const entries = new Map<string, PersonnelRecord[]>();
  for (const record of records) {
    const key = [
      record.projectId,
      record.task ?? '',
      record.fundingEffectiveDate ?? '',
      record.fundingEndDate ?? '',
      record.isFuture,
    ].join('|');
    const lines = entries.get(key);
    if (lines) {
      lines.push(record);
    } else {
      entries.set(key, [record]);
    }
  }
  return Array.from(entries.values(), aggregateDistribution);
}

export function aggregateByPosition(
  data: PersonnelRecord[]
): AggregatedPosition[] {
  const positionMap = new Map<string, AggregatedPosition>();
  const positionLines = new Map<string, PersonnelRecord[]>();
  // Current entries first so position-level figures come from the entry in effect.
  const ordered = [
    ...data.filter((r) => !r.isFuture),
    ...data.filter((r) => r.isFuture),
  ];

  for (const record of ordered) {
    const key = `${record.employeeId}-${record.positionNumber}`;
    const lines = positionLines.get(key);

    if (lines) {
      lines.push(record);
    } else {
      positionLines.set(key, [record]);
      const salaryUnknown = isSalaryUnknown(record);
      const monthlyRate = salaryUnknown ? 0 : record.monthlyRate * record.fte;
      const monthlyFringe = monthlyRate * record.compositeBenefitRate;
      positionMap.set(key, {
        distributions: [],
        employeeId: record.employeeId,
        fte: record.fte,
        isFutureOnly: record.isFuture,
        jobCode: safeText(record.jobCode),
        jobEffectiveDate: record.jobEffectiveDate,
        jobEndDate: record.jobEndDate,
        jobEndingSoon: isEndingSoon(record.jobEndDate),
        key,
        monthlyFringe,
        monthlyRate,
        monthlyTotal: monthlyRate + monthlyFringe,
        name: safeText(record.name),
        positionDescription: safeText(record.positionDescription),
        positionNumber: safeText(record.positionNumber),
        salaryUnknown,
      });
    }
  }

  for (const [key, position] of positionMap) {
    position.distributions = aggregateDistributions(
      positionLines.get(key) ?? []
    );
  }

  return Array.from(positionMap.values());
}

function getPositionSearchText(position: AggregatedPosition): string {
  const projectDescriptions = position.distributions
    .map((dist) => dist.record.projectDescription)
    .join(' ');

  return [
    safeText(position.name),
    safeText(position.positionDescription),
    safeText(position.positionNumber),
    projectDescriptions,
  ].join(' ');
}

function FundingColumnGroup() {
  return (
    <>
      <col className="walter-subtable-col-primary" />
      <col className="walter-subtable-col-secondary" />
      <col className="walter-subtable-col-secondary" />
      <col className="walter-subtable-col-equal" />
      <col className="walter-subtable-col-equal" />
      <col className="walter-subtable-col-equal" />
      <col className="walter-subtable-col-equal" />
      <col className="walter-subtable-col-equal" />
    </>
  );
}

function FundingColumnHeaders() {
  return (
    <>
      <th>Project</th>
      <th className="text-right">Task</th>
      <th>
        <span className="flex justify-end w-full">
          <TooltipLabel
            label="Dist %"
            placement="bottom"
            tooltip={tooltipDefinitions.distributionPercent}
          />
        </span>
      </th>
      <th>
        <span className="flex justify-end w-full">
          <TooltipLabel
            label="FE Start"
            placement="bottom"
            tooltip={tooltipDefinitions.fundingEntryStart}
          />
        </span>
      </th>
      <th>
        <span className="flex justify-end w-full">
          <TooltipLabel
            label="FE End"
            placement="bottom"
            tooltip={tooltipDefinitions.fundingEntryEnd}
          />
        </span>
      </th>
      <th>
        <span className="flex justify-end w-full">Mo. Salary</span>
      </th>
      <th>
        <span className="flex justify-end w-full">
          <TooltipLabel
            label="Mo. CBR"
            placement="bottom"
            tooltip={tooltipDefinitions.monthlyCbr}
          />
        </span>
      </th>
      <th>
        <span className="flex justify-end w-full">Mo. Total</span>
      </th>
    </>
  );
}

function FundingDistributionCells({
  distribution,
  positionLabel,
}: {
  distribution: AggregatedDistribution;
  positionLabel?: string;
}) {
  return (
    <>
      <td className="text-sm">
        <TooltipLabel
          className="block min-w-0"
          focusable={false}
          label={distribution.record.projectDescription}
          labelClassName="block truncate"
          placement="bottom"
          tooltip={distribution.record.projectDescription}
        />
        {positionLabel && (
          <span className="mt-1 block text-xs text-base-content/70">
            {positionLabel}
          </span>
        )}
      </td>
      <td className="text-right text-sm">
        {distribution.record.projectType === 'Internal'
          ? safeText(distribution.record.task)
          : '—'}
      </td>
      <td className="text-right text-sm">
        {distribution.salaryUnknown ? (
          <span className="text-base-content/70">
            {FUNDING_INFO_UNAVAILABLE}
          </span>
        ) : (
          `${formatPercent(distribution.distributionPercent)}%`
        )}
      </td>
      <td className="text-right text-sm">
        {distribution.record.isFuture && <FutureBadge />}
        {formatDate(distribution.record.fundingEffectiveDate, '')}
      </td>
      <td className="text-right text-sm">
        {distribution.fundingEndingSoon ? (
          <TooltipLabel
            asChild
            label={
              <span
                className="text-error inline-flex items-center gap-1"
                tabIndex={0}
              >
                <ClockIcon aria-hidden="true" className="w-3 h-3" />
                {formatDate(distribution.record.fundingEndDate, '')}
              </span>
            }
            placement="bottom"
            tooltip={tooltipDefinitions.endingWithinThreeMonths}
          />
        ) : (
          formatDate(distribution.record.fundingEndDate, '')
        )}
      </td>
      <td className="text-right text-sm">
        {formatAmount(distribution.monthlyRate, distribution.salaryUnknown)}
      </td>
      <td className="text-right text-sm">
        {formatAmount(distribution.monthlyFringe, distribution.salaryUnknown)}
      </td>
      <td className="text-right text-sm">
        {formatAmount(distribution.monthlyTotal, distribution.salaryUnknown)}
      </td>
    </>
  );
}

function formatPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Unsplit amounts are unknown, not zero: show a dash. */
function formatAmount(value: number, salaryUnknown: boolean): string {
  return salaryUnknown ? '—' : formatCurrency(value);
}

function FutureBadge() {
  return (
    <span className="badge badge-soft badge-info badge-sm mr-2">Future</span>
  );
}

function getExportData(positions: AggregatedPosition[]) {
  return positions.flatMap((pos) =>
    pos.distributions.map((dist) => ({
      distributionPercent: dist.salaryUnknown
        ? null
        : formatPercent(dist.distributionPercent),
      fte: pos.fte,
      fundingEffectiveDate: dist.record.fundingEffectiveDate ?? '',
      fundingEndDate: dist.record.fundingEndDate ?? '',
      future: dist.record.isFuture ? 'Yes' : '',
      jobCode: pos.jobCode,
      monthlyFringe: dist.salaryUnknown ? null : dist.monthlyFringe,
      monthlyRate: dist.salaryUnknown ? null : dist.monthlyRate,
      monthlyTotal: dist.salaryUnknown ? null : dist.monthlyTotal,
      name: pos.name,
      positionDescription: pos.positionDescription,
      positionNumber: pos.positionNumber,
      projectDescription: dist.record.projectDescription,
      task:
        dist.record.projectType === 'Internal'
          ? safeText(dist.record.task)
          : '',
    }))
  );
}

const personnelCsvColumns = [
  { header: 'Name', key: 'name' as const },
  { header: 'Position Number', key: 'positionNumber' as const },
  { header: 'Position', key: 'positionDescription' as const },
  { header: 'Job Code', key: 'jobCode' as const },
  { header: 'FTE', key: 'fte' as const },
  { header: 'Project', key: 'projectDescription' as const },
  { header: 'Task', key: 'task' as const },
  { header: 'Dist %', key: 'distributionPercent' as const },
  {
    format: 'date' as const,
    header: 'Eff. Date',
    key: 'fundingEffectiveDate' as const,
  },
  {
    format: 'date' as const,
    header: 'End Date',
    key: 'fundingEndDate' as const,
  },
  { header: 'Future', key: 'future' as const },
  {
    format: 'currency' as const,
    header: 'Monthly Salary (Distributed)',
    key: 'monthlyRate' as const,
  },
  {
    format: 'currency' as const,
    header: 'Monthly CBR (Distributed)',
    key: 'monthlyFringe' as const,
  },
  {
    format: 'currency' as const,
    header: 'Monthly Total',
    key: 'monthlyTotal' as const,
  },
];

interface EmployeeFunding {
  distributions: AggregatedDistribution[];
  employeeId: string;
  name: string;
  positions: AggregatedPosition[];
}

function groupByEmployee(positions: AggregatedPosition[]): EmployeeFunding[] {
  const employees = new Map<string, EmployeeFunding>();
  for (const position of positions) {
    const employee = employees.get(position.employeeId);
    if (employee) {
      employee.positions.push(position);
      employee.distributions.push(...position.distributions);
    } else {
      employees.set(position.employeeId, {
        distributions: [...position.distributions],
        employeeId: position.employeeId,
        name: position.name,
        positions: [position],
      });
    }
  }
  return [...employees.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function summarizeFunding(distributions: AggregatedDistribution[]) {
  const current = distributions.filter(
    (distribution) => !distribution.record.isFuture
  );
  const known = current.filter((distribution) => !distribution.salaryUnknown);
  return {
    monthlyFringe: known.length ? sum(known, (d) => d.monthlyFringe) : null,
    monthlyRate: known.length ? sum(known, (d) => d.monthlyRate) : null,
    monthlyTotal: known.length ? sum(known, (d) => d.monthlyTotal) : null,
    unknownCount: current.length - known.length,
  };
}

function formatFundingAmount(value: number | null): string {
  return value === null ? '—' : formatCurrency(value);
}

function FundingMetric({
  emphasis = false,
  label,
  value,
}: {
  emphasis?: boolean;
  label: string;
  value: number | null;
}) {
  return (
    <span className="min-w-0 sm:min-w-24">
      <span className="block text-xs text-base-content/70">{label}</span>
      <span
        className={`mt-1 block tabular-nums ${emphasis ? 'font-semibold' : 'font-medium'}`}
      >
        {formatFundingAmount(value)}
      </span>
    </span>
  );
}

function EmployeeFundingCard({ employee }: { employee: EmployeeFunding }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const funding = summarizeFunding(employee.distributions);
  const projectCount = new Set(
    employee.distributions.map((d) => d.record.projectId)
  ).size;
  const roles = [
    ...new Set(
      employee.positions.map((position) => position.positionDescription)
    ),
  ]
    .filter(Boolean)
    .join(' · ');
  const futureOnly = employee.distributions.every(
    (distribution) => distribution.record.isFuture
  );
  const fundingEndingSoon = employee.distributions.some(
    (d) => !d.record.isFuture && d.fundingEndingSoon
  );

  return (
    <article
      aria-label={employee.name}
      className="overflow-hidden rounded-box border border-base-300 bg-base-100"
    >
      <button
        aria-controls={detailsId}
        aria-expanded={expanded}
        className="flex w-full flex-wrap items-center gap-4 p-4 text-left transition-colors hover:bg-base-200/50 focus-visible:outline-2 focus-visible:outline-primary"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <ChevronDownIcon
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
          <span className="min-w-0">
            <span className="block font-semibold">{employee.name}</span>
            {roles && (
              <span className="mt-1 block text-sm text-base-content/70">
                {roles}
              </span>
            )}
            <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-base-content/70">
              <span className="inline-flex items-center gap-1">
                <ClipboardDocumentListIcon
                  aria-hidden="true"
                  className="h-4 w-4"
                />
                <span>
                  {projectCount} {projectCount === 1 ? 'project' : 'projects'}
                </span>
              </span>
              <span>Empl ID {employee.employeeId}</span>
              {futureOnly && (
                <span className="badge badge-soft badge-info badge-sm">
                  Future only
                </span>
              )}
              {funding.unknownCount > 0 && (
                <span className="badge badge-soft badge-warning badge-sm">
                  {funding.monthlyRate === null
                    ? 'Funding unavailable'
                    : 'Partial funding'}
                </span>
              )}
              {fundingEndingSoon && (
                <span className="inline-flex items-center gap-1 text-error">
                  <ClockIcon aria-hidden="true" className="h-3 w-3" />
                  Funding ends soon
                </span>
              )}
            </span>
          </span>
        </span>
        <span className="grid w-full grid-cols-3 gap-3 text-right text-sm sm:w-auto sm:gap-6 sm:text-base">
          <FundingMetric label="Mo. Salary" value={funding.monthlyRate} />
          <FundingMetric label="Mo. CBR" value={funding.monthlyFringe} />
          <FundingMetric
            emphasis
            label="Mo. Total"
            value={funding.monthlyTotal}
          />
        </span>
      </button>
      {expanded && (
        <div
          aria-label={`${employee.name} funding distribution`}
          className="border-t border-base-300 px-4 py-3"
          id={detailsId}
          role="region"
        >
          <h4 className="mb-2 text-sm font-semibold">Funding Distribution</h4>
          <div className="overflow-x-auto">
            <table className="table walter-table !min-w-4xl [&_th]:!border-t-0">
              <colgroup>
                <FundingColumnGroup />
              </colgroup>
              <thead>
                <tr>
                  <FundingColumnHeaders />
                </tr>
              </thead>
              <tbody>
                {employee.positions.flatMap((position) =>
                  position.distributions.map((distribution, index) => (
                    <tr key={`${position.key}-${index}`}>
                      <FundingDistributionCells
                        distribution={distribution}
                        positionLabel={
                          employee.positions.length > 1
                            ? `${position.positionDescription} · ${position.jobCode}`
                            : undefined
                        }
                      />
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </article>
  );
}

interface PersonnelTableProps {
  data: PersonnelRecord[];
}

export function PersonnelTable({ data }: PersonnelTableProps) {
  const [search, setSearch] = useState('');
  const [showFuture, setShowFuture] = useState(false);
  const filledData = useMemo(
    () => data.filter((record) => record.name),
    [data]
  );
  const futureCount = useMemo(
    () => filledData.filter((record) => record.isFuture).length,
    [filledData]
  );
  const positions = useMemo(
    () =>
      aggregateByPosition(
        showFuture
          ? filledData
          : filledData.filter((record) => !record.isFuture)
      ),
    [filledData, showFuture]
  );
  const employees = useMemo(() => groupByEmployee(positions), [positions]);
  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query
      ? employees.filter((employee) =>
          employee.positions.some((position) =>
            getPositionSearchText(position).toLocaleLowerCase().includes(query)
          )
        )
      : employees;
  }, [employees, search]);
  const filteredPositions = useMemo(
    () => filteredEmployees.flatMap((employee) => employee.positions),
    [filteredEmployees]
  );
  const totals = useMemo(
    () =>
      summarizeFunding(
        filteredEmployees.flatMap((employee) => employee.distributions)
      ),
    [filteredEmployees]
  );
  const hasSearch = search.trim().length > 0;

  if (filledData.length === 0) {
    return <p className="mt-4 text-base-content/70">No personnel found.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="input input-bordered flex w-full max-w-sm items-center gap-2">
          <MagnifyingGlassIcon
            aria-hidden="true"
            className="h-4 w-4 opacity-50"
          />
          <input
            aria-label="Search personnel"
            className="min-w-0 grow"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search all columns..."
            type="search"
            value={search}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {futureCount > 0 && (
            <button
              className={`btn btn-sm${showFuture ? ' btn-active' : ''}`}
              onClick={() => setShowFuture((current) => !current)}
              type="button"
            >
              {showFuture ? 'Hide' : 'Show'} future entries ({futureCount})
            </button>
          )}
          <ExportDataButton
            columns={personnelCsvColumns}
            data={getExportData(positions)}
            filename="personnel.csv"
          />
          {hasSearch && (
            <ExportDataButton
              columns={personnelCsvColumns}
              data={getExportData(filteredPositions)}
              filename="personnel-filtered.csv"
              label="Export filtered"
            />
          )}
        </div>
      </div>

      <section
        aria-label="PI funding totals"
        className="border-b border-base-300 pb-4"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">
            {hasSearch
              ? 'Filtered monthly funding for this PI'
              : 'Monthly funding for this PI'}
          </h3>
          <span className="text-xs text-base-content/70">
            {filteredEmployees.length}{' '}
            {filteredEmployees.length === 1 ? 'employee' : 'employees'} ·
            Current funding only
          </span>
        </div>
        <dl className="flex flex-wrap gap-x-12 gap-y-3">
          <div>
            <dt className="stat-label">Mo. Salary</dt>
            <dd className="stat-value font-sans">
              {formatFundingAmount(totals.monthlyRate)}
            </dd>
          </div>
          <div>
            <dt className="stat-label">Mo. CBR</dt>
            <dd className="stat-value font-sans">
              {formatFundingAmount(totals.monthlyFringe)}
            </dd>
          </div>
          <div>
            <dt className="stat-label">Mo. Total</dt>
            <dd className="stat-value font-sans">
              {formatFundingAmount(totals.monthlyTotal)}
            </dd>
          </div>
        </dl>
      </section>

      {totals.unknownCount > 0 && (
        <p className="text-sm text-warning" role="status">
          Funding entry info is not available for {totals.unknownCount}{' '}
          {totals.unknownCount === 1 ? 'entry' : 'entries'}. Totals include
          known current funding only.
        </p>
      )}

      {filteredEmployees.length ? (
        <div className="space-y-3">
          {filteredEmployees.map((employee) => (
            <EmployeeFundingCard
              employee={employee}
              key={employee.employeeId}
            />
          ))}
        </div>
      ) : (
        <p className="py-4 text-base-content/70">
          {hasSearch
            ? 'No matching personnel found.'
            : 'No current personnel found. Show future entries to view upcoming funding.'}
        </p>
      )}
    </div>
  );
}
