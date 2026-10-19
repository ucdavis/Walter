import { useMemo, useState } from 'react';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { ExportDataButton } from '@/components/ExportDataButton.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import { formatDate } from '@/lib/date.ts';
import {
  FUNDING_INFO_UNAVAILABLE,
  fundingInfoUnavailableNote,
} from '@/lib/fundingInfo.ts';
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

function DistributionSubtable({
  distributions,
}: {
  distributions: AggregatedDistribution[];
}) {
  return (
    <table className="table walter-table walter-subtable">
      <FundingColumnGroup />
      <thead>
        <tr>
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
            <span className="flex justify-end w-full">Funding Eff. Date</span>
          </th>
          <th>
            <span className="flex justify-end w-full">Funding End Date</span>
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
        </tr>
      </thead>
      <tbody>
        {distributions.map((dist, idx) => (
          <tr key={idx}>
            <td className="text-sm">
              <TooltipLabel
                className="block min-w-0"
                focusable={false}
                label={dist.record.projectDescription}
                labelClassName="block truncate"
                placement="bottom"
                tooltip={dist.record.projectDescription}
              />
            </td>
            <td className="text-right text-sm">
              {dist.record.projectType === 'Internal'
                ? safeText(dist.record.task)
                : '—'}
            </td>
            <td className="text-right text-sm">
              {dist.salaryUnknown ? (
                <span className="text-base-content/70">
                  {FUNDING_INFO_UNAVAILABLE}
                </span>
              ) : (
                `${formatPercent(dist.distributionPercent)}%`
              )}
            </td>
            <td className="text-right text-sm">
              {dist.record.isFuture && <FutureBadge />}
              {formatDate(dist.record.fundingEffectiveDate, '')}
            </td>
            <td className="text-right text-sm">
              {dist.fundingEndingSoon ? (
                <TooltipLabel
                  asChild
                  label={
                    <span
                      className="text-error inline-flex items-center gap-1"
                      tabIndex={0}
                    >
                      <ClockIcon aria-hidden="true" className="w-3 h-3" />
                      {formatDate(dist.record.fundingEndDate, '')}
                    </span>
                  }
                  placement="bottom"
                  tooltip={tooltipDefinitions.endingWithinThreeMonths}
                />
              ) : (
                formatDate(dist.record.fundingEndDate, '')
              )}
            </td>
            <td className="text-right text-sm">
              {formatAmount(dist.monthlyRate, dist.salaryUnknown)}
            </td>
            <td className="text-right text-sm">
              {formatAmount(dist.monthlyFringe, dist.salaryUnknown)}
            </td>
            <td className="text-right text-sm">
              {formatAmount(dist.monthlyTotal, dist.salaryUnknown)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FundingColumnGroup() {
  return (
    <colgroup>
      <col className="walter-subtable-col-primary" />
      <col className="walter-subtable-col-secondary" />
      <col className="walter-subtable-col-secondary" />
      <col className="walter-subtable-col-equal" />
      <col className="walter-subtable-col-equal" />
      <col className="walter-subtable-col-equal" />
      <col className="walter-subtable-col-equal" />
      <col className="walter-subtable-col-equal" />
    </colgroup>
  );
}

function JobDetails({ position }: { position: AggregatedPosition }) {
  const jobEndDate = position.jobEndingSoon ? (
    <TooltipLabel
      asChild
      label={
        <span className="inline-flex items-center gap-1 text-error" tabIndex={0}>
          <ClockIcon aria-hidden="true" className="h-3 w-3" />
          {formatDate(position.jobEndDate, '')}
        </span>
      }
      placement="bottom"
      tooltip={tooltipDefinitions.endingWithinThreeMonths}
    />
  ) : (
    formatDate(position.jobEndDate, '')
  );
  return (
    <div className="py-1">
      <h4 className="mb-1 text-sm font-semibold">Job Details</h4>
      <dl className="grid grid-cols-6 gap-x-6 text-sm">
        <div>
          <dt className="font-semibold">Empl ID</dt>
          <dd className="mt-1">{position.employeeId}</dd>
        </div>
        <div>
          <dt className="font-semibold">Job Code</dt>
          <dd className="mt-1">{position.jobCode}</dd>
        </div>
        <div className="col-span-2">
          <dt className="font-semibold">Job Code Description</dt>
          <dd className="mt-1">{position.positionDescription}</dd>
        </div>
        <div>
          <dt className="font-semibold">Eff. Date</dt>
          <dd className="mt-1">
            {formatDate(position.jobEffectiveDate, '')}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">End Date</dt>
          <dd className="mt-1">{jobEndDate}</dd>
        </div>
      </dl>
    </div>
  );
}

function EmployeeSummary({
  isExpanded,
  position,
}: {
  isExpanded: boolean;
  position: AggregatedPosition;
}) {
  const fundingEndingSoon = position.distributions.some(
    (distribution) => distribution.fundingEndingSoon
  );
  const projectCount = new Set(
    position.distributions.map((distribution) => distribution.record.projectId)
  ).size;
  const projectLabel = `${projectCount} ${
    projectCount === 1 ? 'project' : 'projects'
  }`;

  return (
    <div
      aria-label={`${position.name} (${position.employeeId}) - ${position.positionDescription}`}
      className="flex w-full items-start gap-3 sm:items-center"
    >
      {isExpanded ? (
        <ChevronUpIcon
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0"
        />
      ) : (
        <ChevronDownIcon
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-48 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span>{position.name}</span>
            {position.isFutureOnly && <FutureBadge />}
          </div>
          <p className="mt-1 truncate text-sm text-base-content/70">
            {position.positionDescription} ·{' '}
            <TooltipLabel
              focusable={false}
              label={
                <>
                  {position.fte} <span>FTE</span>
                </>
              }
              placement="bottom"
              tooltip={tooltipDefinitions.fte}
            />
          </p>
          {fundingEndingSoon && (
            <span className="badge badge-soft badge-error badge-sm mt-2">
              Funding ends soon
            </span>
          )}
        </div>

        <div
          aria-label={projectLabel}
          className="flex items-center gap-1.5 text-sm text-base-content/70"
        >
          <ClipboardDocumentListIcon aria-hidden="true" className="h-4 w-4" />
          <span className="font-semibold text-base-content">{projectCount}</span>
          <span className="hidden sm:inline">
            {projectCount === 1 ? 'project' : 'projects'}
          </span>
        </div>

        <dl className="grid w-full grid-cols-3 gap-x-4 text-right text-sm sm:w-auto sm:gap-x-6">
          <SummaryMetric
            label="Mo. Salary"
            value={formatAmount(position.monthlyRate, position.salaryUnknown)}
          />
          <SummaryMetric
            label="Mo. CBR"
            value={formatAmount(position.monthlyFringe, position.salaryUnknown)}
          />
          <SummaryMetric
            emphasis
            label="Mo. Total"
            value={formatAmount(position.monthlyTotal, position.salaryUnknown)}
          />
        </dl>
      </div>
    </div>
  );
}

function SummaryMetric({
  emphasis = false,
  label,
  value,
}: {
  emphasis?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-24">
      <dt className="text-xs text-base-content/70">{label}</dt>
      <dd className={emphasis ? 'font-semibold' : undefined}>{value}</dd>
    </div>
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

interface PersonnelTableProps {
  data: PersonnelRecord[];
}

function sumCurrent(
  positions: AggregatedPosition[],
  pick: (position: AggregatedPosition) => number
): number {
  return positions.reduce(
    (sum, position) =>
      position.isFutureOnly || position.salaryUnknown
        ? sum
        : sum + pick(position),
    0
  );
}

/** Distinct people whose current salary can't be attributed (Unsplit). */
function countSalaryUnknownPeople(positions: AggregatedPosition[]): number {
  return new Set(
    positions
      .filter((p) => p.salaryUnknown && !p.isFutureOnly)
      .map((p) => p.employeeId)
  ).size;
}

export function PersonnelTable({ data }: PersonnelTableProps) {
  const [expandedPositionKeys, setExpandedPositionKeys] = useState<Set<string>>(
    () => new Set()
  );
  const [search, setSearch] = useState('');
  const [showFuture, setShowFuture] = useState(false);
  // Unfilled positions (legacy sources only) stay hidden.
  const filledData = useMemo(() => data.filter((r) => r.name), [data]);
  const futureCount = useMemo(
    () => filledData.filter((r) => r.isFuture).length,
    [filledData]
  );
  const positions = useMemo(() => {
    const visibleRecords = showFuture
      ? filledData
      : filledData.filter((record) => !record.isFuture);

    return aggregateByPosition(visibleRecords).sort((a, b) =>
      safeText(a.name).localeCompare(safeText(b.name))
    );
  }, [filledData, showFuture]);

  const filteredPositions = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    if (!normalizedSearch) {
      return positions;
    }

    return positions.filter((position) =>
      getPositionSearchText(position)
        .toLocaleLowerCase()
        .includes(normalizedSearch)
    );
  }, [positions, search]);

  const allFilteredPositionsExpanded =
    filteredPositions.length > 0 &&
    filteredPositions.every((position) => expandedPositionKeys.has(position.key));
  const totals = useMemo(
    () => ({
      monthlyFringe: sumCurrent(filteredPositions, (p) => p.monthlyFringe),
      monthlyRate: sumCurrent(filteredPositions, (p) => p.monthlyRate),
      monthlyTotal: sumCurrent(filteredPositions, (p) => p.monthlyTotal),
    }),
    [filteredPositions]
  );

  const salaryUnknownPeople = useMemo(
    () => countSalaryUnknownPeople(filteredPositions),
    [filteredPositions]
  );

  const togglePosition = (key: string) => {
    setExpandedPositionKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);
      if (nextKeys.has(key)) {
        nextKeys.delete(key);
      } else {
        nextKeys.add(key);
      }
      return nextKeys;
    });
  };

  const toggleAllFilteredPositions = () => {
    setExpandedPositionKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);
      for (const position of filteredPositions) {
        if (allFilteredPositionsExpanded) {
          nextKeys.delete(position.key);
        } else {
          nextKeys.add(position.key);
        }
      }
      return nextKeys;
    });
  };

  if (positions.length === 0) {
    return <p className="text-base-content/70 mt-4">No personnel found.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="h3 mb-3">Funding Distribution Totals</h3>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="stat-label">Monthly Salary</dt>
            <dd className="stat-value">
              {formatCurrency(totals.monthlyRate)}
            </dd>
          </div>
          <div>
            <dt className="stat-label">Monthly CBR</dt>
            <dd className="stat-value">
              {formatCurrency(totals.monthlyFringe)}
            </dd>
          </div>
          <div>
            <dt className="stat-label">Monthly Total</dt>
            <dd className="stat-value">
              {formatCurrency(totals.monthlyTotal)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          aria-label="Search personnel"
          className="input input-bordered w-full max-w-sm"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search all columns..."
          type="search"
          value={search}
        />
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
          {search.trim() && (
            <ExportDataButton
              columns={personnelCsvColumns}
              data={getExportData(filteredPositions)}
              filename="personnel-filtered.csv"
              label="Export filtered"
            />
          )}
          <button
            aria-label={
              allFilteredPositionsExpanded
                ? 'Collapse all employees'
                : 'Expand all employees'
            }
            className="btn btn-sm"
            onClick={toggleAllFilteredPositions}
            type="button"
          >
            {allFilteredPositionsExpanded ? 'Collapse all' : 'Expand all'}
          </button>
        </div>
      </div>

      {filteredPositions.length === 0 ? (
        <p className="text-base-content/70">No matching personnel found.</p>
      ) : (
        <div className="space-y-3">
          {filteredPositions.map((position) => {
            const isExpanded = expandedPositionKeys.has(position.key);
            const detailsId = `personnel-details-${position.key}`;

            return (
              <article
                className="overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-sm"
                key={position.key}
              >
                <button
                  aria-controls={detailsId}
                  aria-expanded={isExpanded}
                  className="w-full p-4 text-left transition-colors hover:bg-base-200 focus-visible:outline-2 focus-visible:outline-primary"
                  onClick={() => togglePosition(position.key)}
                  type="button"
                >
                  <EmployeeSummary
                    isExpanded={isExpanded}
                    position={position}
                  />
                </button>
                {isExpanded && (
                  <div
                    className="border-t border-base-300 bg-base-200 p-4"
                    id={detailsId}
                  >
                    <JobDetails position={position} />
                    <h4 className="mt-4 mb-2 text-sm font-semibold">
                      Funding Distribution
                    </h4>
                    <div className="overflow-x-auto">
                      <DistributionSubtable
                        distributions={position.distributions}
                      />
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {salaryUnknownPeople > 0 && (
        <p className="mt-2 text-sm text-warning">
          {fundingInfoUnavailableNote('Totals', salaryUnknownPeople)}
        </p>
      )}
    </div>
  );
}
