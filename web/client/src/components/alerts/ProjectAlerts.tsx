import { formatCurrency } from '@/lib/currency.ts';
import { getAlertsForProject, type Alert } from '@/lib/projectAlerts.ts';
import type { ProjectSummary } from '@/lib/projectSummary.ts';
import {
  CalendarIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { Link } from '@tanstack/react-router';

function AlertIcon({ type }: { type: Alert['type'] }) {
  if (type === 'reconciliation-balanced') {
    return <CheckCircleIcon className="h-5 w-5" />;
  }
  if (type === 'ending-soon') {
    return <CalendarIcon className="h-5 w-5" />;
  }
  if (type === 'negative-balance' || type === 'reconciliation-issue') {
    return <ExclamationCircleIcon className="h-5 w-5" />;
  }
  return <ExclamationTriangleIcon className="h-5 w-5" />;
}

function isReconciliationAlert(type: Alert['type']) {
  return type === 'reconciliation-issue' || type === 'reconciliation-balanced';
}

interface AlertCardProps {
  alert: Alert;
  balance: number;
  linkParams?: { iamId: string; projectNumber: string };
}

export function AlertCard({ alert, balance, linkParams }: AlertCardProps) {
  const showBalance =
    alert.type === 'negative-balance' || alert.type === 'low-budget';

  const content = (
    <>
      <AlertIcon type={alert.type} />
      <span>
        {alert.message}
        {showBalance && ` (${formatCurrency(balance)})`}
      </span>
    </>
  );

  if (linkParams) {
    if (isReconciliationAlert(alert.type)) {
      return (
        <Link
          className={`alert alert-${alert.severity} alert-soft`}
          params={{ projectNumber: linkParams.projectNumber }}
          role="alert"
          to="/reports/reconciliation/$projectNumber/"
        >
          {content}
        </Link>
      );
    }

    return (
      <Link
        className={`alert alert-${alert.severity} alert-soft`}
        params={linkParams}
        role="alert"
        to="/projects/$iamId/$projectNumber/"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className={`alert alert-${alert.severity} alert-soft`} role="alert">
      {content}
    </div>
  );
}

interface ProjectAlertsProps {
  awardEndedAlert?: {
    colorClass: 'alert-accent' | 'alert-info';
    message: string;
  };
  iamId?: string;
  prefix?: string;
  reconciliationStatus?: 'balanced' | 'discrepancy';
  summary: ProjectSummary;
}

export function ProjectAlerts({
  awardEndedAlert,
  iamId,
  prefix,
  reconciliationStatus,
  summary,
}: ProjectAlertsProps) {
  const alerts = getAlertsForProject(summary, prefix);
  const showReconciliationStatus = summary.isInternal;

  if (showReconciliationStatus && reconciliationStatus === 'discrepancy') {
    alerts.push({
      id: `reconciliation-issue-${summary.projectNumber}`,
      message: `${prefix ?? 'This project '}has a GL/PPM reconciliation discrepancy. Click here to view details.`,
      severity: 'warning',
      type: 'reconciliation-issue',
    });
  }

  if (showReconciliationStatus && reconciliationStatus === 'balanced') {
    alerts.push({
      id: `reconciliation-balanced-${summary.projectNumber}`,
      message: `${prefix ?? ''}GL/PPM is Balanced. Click here to view.`,
      severity: 'success',
      type: 'reconciliation-balanced',
    });
  }

  if (!awardEndedAlert && alerts.length === 0) {
    return null;
  }

  const linkParams = iamId
    ? { iamId, projectNumber: summary.projectNumber }
    : undefined;

  return (
    <div className="flex flex-col gap-3">
      {awardEndedAlert ? (
        <div
          className={`alert alert-soft ${awardEndedAlert.colorClass}`}
          role="alert"
        >
          {awardEndedAlert.message}
        </div>
      ) : null}
      {alerts.map((alert) => (
        <AlertCard
          alert={alert}
          balance={summary.totals.balance}
          key={alert.id}
          linkParams={linkParams}
        />
      ))}
    </div>
  );
}
