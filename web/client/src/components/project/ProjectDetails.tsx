import { formatDate } from '@/lib/date.ts';
import { formatCurrency } from '@/lib/currency.ts';
import type { ProjectSummary } from '@/lib/projectSummary.ts';
import { type BudgetProgressSummary } from '@/lib/projectProgress.ts';
import { Currency } from '@/shared/Currency.tsx';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';
import { tooltipDefinitions } from '@/shared/tooltips.ts';
import type { ReactNode } from 'react';
import {
  AcademicCapIcon,
  BanknotesIcon,
  ClipboardDocumentCheckIcon,
  CalendarDaysIcon,
  UserIcon,
} from '@heroicons/react/24/outline';

interface ProjectDetailsProps {
  actions?: ReactNode;
  summary: ProjectSummary;
}

const displayValue = (value: string | null) => value ?? 'Not provided';
const INTERNAL_PROJECT_COLOR = 'var(--color-accent)';
const SPONSORED_PROJECT_COLOR = 'var(--color-info)';

const hasProjectDates = (summary: ProjectSummary) =>
  Boolean(summary.awardStartDate || summary.awardEndDate);

interface PacingProgressSegment {
  color: string;
  label: string;
  width: number;
}

interface PacingProgressBarProps {
  ariaLabel: string;
  segments: PacingProgressSegment[];
}

const nonnegative = (value: number) => Math.max(0, value);

const progressPercent = (value: number, total: number) =>
  total > 0 ? (value / total) * 100 : 0;

const formatPacingPercent = (value: number) => `${Math.round(value)}%`;

const commitmentColor = (color: string) =>
  `color-mix(in srgb, ${color} 68%, white)`;

const availableColor = (color: string) =>
  `color-mix(in srgb, ${color} 24%, var(--color-base-300))`;

function getSummaryBudgetProgress(
  summary: ProjectSummary
): BudgetProgressSummary {
  const budget = nonnegative(summary.totals.budget);
  const committed = nonnegative(summary.totals.encumbrance);
  const spent = nonnegative(summary.totals.expense);
  const overrun = Math.max(nonnegative(-summary.totals.balance), 0);
  const remaining = nonnegative(summary.totals.balance);
  const total = Math.max(
    spent + committed + remaining + overrun,
    budget + overrun,
    1
  );

  return {
    budget,
    committed,
    committedPercent: progressPercent(committed, total),
    overrun,
    overrunPercent: progressPercent(overrun, total),
    remaining,
    remainingPercent: progressPercent(remaining, total),
    spent,
    spentPercent: progressPercent(spent, total),
  };
}

function getBudgetRemainingText(progress: BudgetProgressSummary) {
  if (progress.overrun > 0) {
    return progress.budget > 0
      ? `${formatCurrency(progress.overrun)} (${formatPacingPercent(
          progress.overrunPercent
        )}) over`
      : `${formatCurrency(progress.overrun)} over`;
  }

  return `${formatCurrency(progress.remaining)} (${formatPacingPercent(
    progress.remainingPercent
  )})`;
}

function PacingProgressBar({ ariaLabel, segments }: PacingProgressBarProps) {
  return (
    <div
      aria-label={ariaLabel}
      className="flex h-3 overflow-hidden rounded-sm bg-base-300"
      role="img"
    >
      {segments
        .filter((segment) => segment.width > 0)
        .map((segment) => (
          <span
            aria-hidden="true"
            className="block h-full"
            key={segment.label}
            style={{
              backgroundColor: segment.color,
              width: `${segment.width}%`,
            }}
          />
        ))}
    </div>
  );
}

function AllExpensesProgress({
  baseColor,
  progress,
}: {
  baseColor: string;
  progress: BudgetProgressSummary;
}) {
  const spentText = `${formatCurrency(progress.spent)} (${formatPacingPercent(progress.spentPercent)}) spent`;
  const committedText = `${formatCurrency(progress.committed)} (${formatPacingPercent(progress.committedPercent)}) committed`;
  const remainingText = getBudgetRemainingText(progress);
  const budgetText = `${formatCurrency(progress.budget)} budget`;
  const overrunText =
    progress.overrun > 0
      ? `${formatCurrency(progress.overrun)} over budget`
      : null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm text-base-content/80">
        <p className="flex flex-wrap gap-x-3 gap-y-1">
          <span>{spentText}</span>
          <span aria-hidden="true">|</span>
          <span>{committedText}</span>
        </p>
        <p
          className={`ml-auto text-right${progress.overrun > 0 ? ' font-proxima-bold text-error' : ''}`}
        >
          {remainingText}
        </p>
      </div>
      <PacingProgressBar
        ariaLabel={`All Expenses: ${spentText}, ${committedText}, ${remainingText}${overrunText ? `, ${overrunText}` : ''}, ${budgetText}`}
        segments={[
          {
            color: baseColor,
            label: 'Spent',
            width: progress.spentPercent,
          },
          {
            color: commitmentColor(baseColor),
            label: 'Committed',
            width: progress.committedPercent,
          },
          {
            color: availableColor(baseColor),
            label: 'Remaining',
            width: progress.remainingPercent,
          },
          {
            color: 'var(--color-error)',
            label: 'Overrun',
            width: progress.overrunPercent,
          },
        ]}
      />
    </div>
  );
}

export function ProjectDetails({ actions, summary }: ProjectDetailsProps) {
  const budgetProgress = getSummaryBudgetProgress(summary);
  const projectColor = summary.isInternal
    ? INTERNAL_PROJECT_COLOR
    : SPONSORED_PROJECT_COLOR;
  const balanceClassName = `text-3xl font-proxima-bold ${
    summary.totals.balance < 0
      ? 'text-error'
      : summary.isInternal
        ? 'text-accent'
        : 'text-info'
  }`;

  return (
    <section className="section-margin">
      <div className="fancy-data mt-4 space-y-4">
        <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col">
            <BanknotesIcon className="w-4 h-4" />
            <dt className="stat-label">
              <TooltipLabel
                label="Balance"
                tooltip={tooltipDefinitions.balance}
              />
            </dt>
            <dd className={balanceClassName}>
              <Currency value={summary.totals.balance} />
            </dd>
          </div>
          <div className="flex flex-col">
            <ClipboardDocumentCheckIcon className="w-4 h-4" />
            <dt className="stat-label">Budget</dt>
            <dd className="stat-value">
              <Currency value={summary.totals.budget} />
            </dd>
          </div>
          <div className="flex flex-col">
            <BanknotesIcon className="w-4 h-4" />
            <dt className="stat-label">Expense</dt>
            <dd className="stat-value">
              <Currency value={summary.totals.expense} />
            </dd>
          </div>
          <div className="flex flex-col">
            <ClipboardDocumentCheckIcon className="w-4 h-4" />
            <dt className="stat-label">
              <TooltipLabel
                label="Commitment"
                tooltip={tooltipDefinitions.commitment}
              />
            </dt>
            <dd className="stat-value">
              <Currency value={summary.totals.encumbrance} />
            </dd>
          </div>
        </dl>

        <AllExpensesProgress
          baseColor={projectColor}
          progress={budgetProgress}
        />

        <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {hasProjectDates(summary) && (
            <>
              <div className="flex flex-col">
                <CalendarDaysIcon className="w-4 h-4" />
                <dt className="stat-label">Project Start</dt>
                <dd className="stat-value">
                  {formatDate(summary.awardStartDate)}
                </dd>
              </div>
              <div className="flex flex-col">
                <CalendarDaysIcon className="w-4 h-4" />
                <dt className="stat-label">Project End</dt>
                <dd className="stat-value">
                  {formatDate(summary.awardEndDate)}
                </dd>
              </div>
            </>
          )}
          <div className="flex flex-col">
            <UserIcon className="w-4 h-4" />
            <dt className="stat-label">Project Manager</dt>
            <dd className="stat-value">{displayValue(summary.pm)}</dd>
          </div>
          <div className="flex flex-col">
            <AcademicCapIcon className="w-4 h-4" />
            <dt className="stat-label">Principal Investigator</dt>
            <dd className="stat-value">{displayValue(summary.pi)}</dd>
          </div>
        </dl>
      </div>
      {actions ? (
        <div className="mt-4 flex flex-wrap gap-2">{actions}</div>
      ) : null}
    </section>
  );
}
