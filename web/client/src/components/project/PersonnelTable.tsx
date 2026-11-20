import { Fragment, useId, useMemo, useState } from 'react';
import {
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  ChevronDownIcon,
  ChevronUpIcon,
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
import { useExpandableOverlay } from '@/shared/hooks/useExpandableOverlay.ts';

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
  return [
    position.name,
    position.employeeId,
    position.positionDescription,
    position.positionNumber,
    position.jobCode,
    ...position.distributions.flatMap((distribution) => [
      distribution.record.projectDescription,
      distribution.record.projectId,
      distribution.record.projectType === 'Internal'
        ? distribution.record.task
        : '',
    ]),
  ].join(' ');
}

export function FundingColumnGroup() {
  return (
    <>
      <col className="personnel-reverse-col-project" />
      <col className="personnel-reverse-col-task" />
      <col className="personnel-reverse-col-task" />
      <col className="personnel-reverse-col-value" />
      <col className="personnel-reverse-col-value" />
      <col className="personnel-reverse-col-value" />
      <col className="personnel-reverse-col-value" />
      <col className="personnel-reverse-col-value" />
    </>
  );
}

export function FundingColumnHeaders() {
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
}: {
  distribution: AggregatedDistribution;
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

function JobDetails({ position }: { position: AggregatedPosition }) {
  return (
    <div className="border-base-300 py-2">
      <h4 className="mb-1 px-8 font-semibold text-sm">Job Details</h4>
      <table className="w-full table-fixed text-sm [&_th]:!border-y-0 [&_th]:!py-1 [&_td]:!py-1 [&_tr>:first-child]:!pl-8">
        <colgroup>
          <col className="personnel-job-details-col-id" />
          <col className="personnel-job-details-col-code" />
          <col className="personnel-job-details-col-description" />
          <col className="personnel-reverse-col-task" />
          <col className="personnel-reverse-col-value" />
          <col className="personnel-reverse-col-value" />
          <col className="personnel-reverse-col-value" />
          <col className="personnel-reverse-col-value" />
          <col className="personnel-reverse-col-value" />
        </colgroup>
        <thead>
          <tr>
            <th>Empl ID</th>
            <th>Job Code</th>
            <th>Job Code Description</th>
            <th className="text-right">
              <TooltipLabel
                label="FTE"
                placement="bottom"
                tooltip={tooltipDefinitions.fte}
              />
            </th>
            <th className="text-right">Eff. Date</th>
            <th className="text-right">End Date</th>
            <th className="text-right">Mo. Job Salary</th>
            <th className="text-right">
              <TooltipLabel
                label="Mo. Job CBR"
                placement="bottom"
                tooltip={tooltipDefinitions.monthlyCbr}
              />
            </th>
            <th className="text-right">Mo. Job Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{position.employeeId}</td>
            <td>{position.jobCode}</td>
            <td>{position.positionDescription}</td>
            <td className="text-right">{position.fte}</td>
            <td className="text-right">
              {formatDate(position.jobEffectiveDate, '')}
            </td>
            <td className="text-right">
              {position.jobEndingSoon ? (
                <TooltipLabel
                  asChild
                  label={
                    <span
                      className="text-error inline-flex items-center gap-1"
                      tabIndex={0}
                    >
                      <ClockIcon aria-hidden="true" className="w-4 h-4" />
                      {formatDate(position.jobEndDate, '')}
                    </span>
                  }
                  placement="bottom"
                  tooltip={tooltipDefinitions.endingWithinThreeMonths}
                />
              ) : (
                formatDate(position.jobEndDate, '')
              )}
            </td>
            <td className="text-right">
              {formatAmount(position.monthlyRate, position.salaryUnknown)}
            </td>
            <td className="text-right">
              {formatAmount(position.monthlyFringe, position.salaryUnknown)}
            </td>
            <td className="text-right">
              {formatAmount(position.monthlyTotal, position.salaryUnknown)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
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

function sumCurrentDistributions(
  positions: AggregatedPosition[],
  pick: (distribution: AggregatedDistribution) => number
): number {
  return sum(positions, (position) =>
    sum(
      position.distributions.filter(
        (distribution) =>
          !distribution.record.isFuture && !distribution.salaryUnknown
      ),
      pick
    )
  );
}

/** Distinct people whose current salary can't be attributed (Unsplit). */
function countSalaryUnknownPeople(positions: AggregatedPosition[]): number {
  return new Set(
    positions
      .filter((position) =>
        position.distributions.some(
          (distribution) =>
            distribution.salaryUnknown && !distribution.record.isFuture
        )
      )
      .map((p) => p.employeeId)
  ).size;
}

const sortOptions = [
  ['name', 'Employee name'],
  ['jobCode', 'Job code'],
  ['fte', 'FTE'],
  ['jobEffectiveDate', 'Job effective date'],
  ['jobEndDate', 'Job end date'],
  ['monthlyRate', 'Monthly funding salary'],
  ['monthlyFringe', 'Monthly funding CBR'],
  ['monthlyTotal', 'Monthly funding total'],
] as const;
type PersonnelSortKey = (typeof sortOptions)[number][0];

function getSortValue(position: AggregatedPosition, key: PersonnelSortKey) {
  switch (key) {
    case 'monthlyRate':
    case 'monthlyFringe':
    case 'monthlyTotal':
      return sumCurrentDistributions(
        [position],
        (distribution) => distribution[key]
      );
    default:
      return position[key] ?? '';
  }
}

export function PersonnelTable({ data }: PersonnelTableProps) {
  const detailsPrefix = useId();
  const [sortKey, setSortKey] = useState<PersonnelSortKey>('name');
  const [sortDescending, setSortDescending] = useState(false);
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
  } = useExpandableOverlay({ enabled: true });
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
  const positions = useMemo(
    () =>
      aggregateByPosition(
        showFuture ? filledData : filledData.filter((r) => !r.isFuture)
      ),
    [filledData, showFuture]
  );

  const filteredPositions = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    const matchingPositions = normalizedSearch
      ? positions.filter(
          (position) =>
            getPositionSearchText(position)
              .toLocaleLowerCase()
              .includes(normalizedSearch) ||
            (normalizedSearch.endsWith('%') &&
              position.distributions.some(
                (distribution) =>
                  !distribution.salaryUnknown &&
                  `${formatPercent(distribution.distributionPercent)}%` ===
                    normalizedSearch
              ))
        )
      : positions;

    return [...matchingPositions].sort((a, b) => {
      const left = getSortValue(a, sortKey);
      const right = getSortValue(b, sortKey);
      const comparison =
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left).localeCompare(String(right), undefined, {
              numeric: true,
            });
      return (
        (sortDescending ? -comparison : comparison) ||
        a.name.localeCompare(b.name)
      );
    });
  }, [positions, search, sortKey, sortDescending]);

  const allExpanded =
    filteredPositions.length > 0 &&
    filteredPositions.every((position) =>
      expandedPositionKeys.has(position.key)
    );

  const togglePosition = (key: string) => {
    setExpandedPositionKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleAllPositions = () => {
    setExpandedPositionKeys((current) => {
      if (allExpanded) {
        return new Set(
          [...current].filter(
            (key) => !filteredPositions.some((position) => position.key === key)
          )
        );
      }
      return new Set([
        ...current,
        ...filteredPositions.map((position) => position.key),
      ]);
    });
  };

  const salaryUnknownPeople = useMemo(
    () => countSalaryUnknownPeople(filteredPositions),
    [filteredPositions]
  );

  if (filledData.length === 0) {
    return <p className="text-base-content/70 mt-4">No personnel found.</p>;
  }

  return (
    <>
      {isOverlayActive && (
        <>
          <div
            aria-hidden="true"
            className="fixed inset-0 bg-black/40 z-90"
            onClick={closeExpanded}
          />
          <div
            aria-hidden="true"
            ref={placeholderRef}
            style={{ height: placeholderHeight ?? undefined }}
          />
        </>
      )}
      <div
        aria-label={isOverlayActive ? 'Personnel table' : undefined}
        className={
          isOverlayActive
            ? `fixed z-100 flex flex-col min-h-0 bg-base-100 rounded-box shadow-xl p-4 ${prefersReducedMotion || !canAnimateRect ? 'transition-none' : 'transition-[top,left,width,height] duration-300 ease-in-out'}`
            : ''
        }
        onTransitionEnd={handleContainerTransitionEnd}
        ref={containerRef}
        role={isOverlayActive ? 'dialog' : undefined}
        style={overlayStyle}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <label className="input input-bordered flex max-w-sm flex-1 items-center gap-2">
            <svg
              aria-hidden="true"
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
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </g>
            </svg>
            <input
              aria-label="Search personnel"
              className="grow"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search employees or projects..."
              type="text"
              value={search}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Sort personnel by"
              className="select select-sm w-auto"
              onChange={(event) =>
                setSortKey(event.target.value as PersonnelSortKey)
              }
              value={sortKey}
            >
              {sortOptions.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <button
              aria-label={
                sortDescending
                  ? 'Descending; switch to ascending order'
                  : 'Ascending; switch to descending order'
              }
              className="btn btn-sm"
              onClick={() => setSortDescending((current) => !current)}
              type="button"
            >
              {sortDescending ? 'Descending' : 'Ascending'}
            </button>
            <button
              className="btn btn-sm"
              disabled={filteredPositions.length === 0}
              onClick={toggleAllPositions}
              type="button"
            >
              {allExpanded ? 'Collapse all' : 'Expand all'}
            </button>
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
            <button
              aria-label={isOverlayActive ? 'Collapse table' : 'Expand table'}
              className="btn btn-sm btn-square"
              onClick={toggleExpanded}
              ref={expandButtonRef}
              type="button"
            >
              {isOverlayActive ? (
                <ArrowsPointingInIcon aria-hidden="true" className="size-5" />
              ) : (
                <ArrowsPointingOutIcon aria-hidden="true" className="size-5" />
              )}
            </button>
            {search.trim() && (
              <ExportDataButton
                columns={personnelCsvColumns}
                data={getExportData(filteredPositions)}
                filename="personnel-filtered.csv"
                label="Export filtered"
              />
            )}
          </div>
        </div>
        <div
          className={
            isOverlayActive ? 'flex-1 min-h-0 overflow-auto' : 'overflow-x-auto'
          }
        >
          <table className="table walter-table personnel-reverse-table">
            <colgroup>
              <col className="personnel-reverse-col-employee" />
              <FundingColumnGroup />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Employee</th>
                <FundingColumnHeaders />
              </tr>
            </thead>
            <tbody aria-hidden="true">
              <tr>
                <td className="!h-2 !border-0 !p-0" colSpan={9} />
              </tr>
            </tbody>
            {filteredPositions.map((position) => {
              const isExpanded = expandedPositionKeys.has(position.key);
              const detailsId = `${detailsPrefix}-${encodeURIComponent(position.key)}`;

              return (
                <Fragment key={position.key}>
                  <tbody
                    className={`personnel-row-group${isExpanded ? ' personnel-row-expanded' : ''}`}
                  >
                    {position.distributions.map((distribution, index) => (
                      <tr
                        className={
                          index === position.distributions.length - 1
                            ? 'personnel-funding-last'
                            : undefined
                        }
                        key={`${position.key}-${index}`}
                      >
                        {index === 0 && (
                          <td
                            className="personnel-employee-cell align-top"
                            rowSpan={position.distributions.length}
                          >
                            <button
                              aria-controls={detailsId}
                              aria-expanded={isExpanded}
                              className="flex w-full items-start gap-3 rounded-sm text-left leading-relaxed focus-visible:outline-2 focus-visible:outline-primary"
                              onClick={() => togglePosition(position.key)}
                              type="button"
                            >
                              {isExpanded ? (
                                <ChevronUpIcon
                                  aria-hidden="true"
                                  className="h-4 w-4 shrink-0"
                                />
                              ) : (
                                <ChevronDownIcon
                                  aria-hidden="true"
                                  className="h-4 w-4 shrink-0"
                                />
                              )}
                              <span>
                                {position.isFutureOnly && <FutureBadge />}
                                {position.name
                                  ? `${position.name} (${position.employeeId}) - `
                                  : ''}
                                {position.positionDescription}
                              </span>
                            </button>
                          </td>
                        )}
                        <FundingDistributionCells distribution={distribution} />
                      </tr>
                    ))}
                    <tr
                      className="personnel-job-row bg-base-200"
                      hidden={!isExpanded}
                      id={detailsId}
                    >
                      <td className="!p-0" colSpan={9}>
                        {isExpanded && <JobDetails position={position} />}
                      </td>
                    </tr>
                  </tbody>
                  <tbody aria-hidden="true">
                    <tr>
                      <td className="!h-3 !border-0 !p-0" colSpan={9} />
                    </tr>
                  </tbody>
                </Fragment>
              );
            })}
            {filteredPositions.length === 0 && (
              <tbody>
                <tr>
                  <td colSpan={9}>No matching personnel found.</td>
                </tr>
              </tbody>
            )}
            <tfoot>
              <tr className="totaltr">
                <th colSpan={6} scope="row">
                  Funding Distribution Totals
                </th>
                <td className="text-right">
                  {formatCurrency(
                    sumCurrentDistributions(
                      filteredPositions,
                      (d) => d.monthlyRate
                    )
                  )}
                </td>
                <td className="text-right">
                  {formatCurrency(
                    sumCurrentDistributions(
                      filteredPositions,
                      (d) => d.monthlyFringe
                    )
                  )}
                </td>
                <td className="text-right">
                  {formatCurrency(
                    sumCurrentDistributions(
                      filteredPositions,
                      (d) => d.monthlyTotal
                    )
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        {salaryUnknownPeople > 0 && (
          <p className="mt-2 text-sm text-warning">
            {fundingInfoUnavailableNote('Totals', salaryUnknownPeople)}
          </p>
        )}
      </div>
    </>
  );
}
