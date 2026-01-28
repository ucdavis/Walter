import { formatCurrency } from '@/lib/currency.ts';
import { getAlertsForProject, type Alert } from '@/lib/projectAlerts.ts';
import type { ProjectSummary } from '@/lib/projectSummary.ts';
import {
  CalendarIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { Link } from '@tanstack/react-router';

function AlertIcon({ type }: { type: Alert['type'] }) {
  if (type === 'ending-soon') {
    return <CalendarIcon className="h-5 w-5" />;
  }
  if (type === 'negative-balance') {
    return <ExclamationCircleIcon className="h-5 w-5" />;
  }
  return <ExclamationTriangleIcon className="h-5 w-5" />;
}

interface AlertCardProps {
  alert: Alert;
  balance: number;
  linkParams?: { employeeId: string; projectNumber: string };
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
    return (
      <Link
        className={`alert alert-${alert.severity} alert-soft`}
        params={linkParams}
        role="alert"
        to="/projects/$employeeId/$projectNumber/"
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
  summary: ProjectSummary;
  employeeId?: string;
  prefix?: string;
}

export function ProjectAlerts({
  summary,
  employeeId,
  prefix,
}: ProjectAlertsProps) {
  const alerts = getAlertsForProject(summary, prefix);

  if (alerts.length === 0) {
    return null;
  }

  const linkParams = employeeId
    ? { employeeId, projectNumber: summary.projectNumber }
    : undefined;

  return (
    <div className="flex flex-col gap-3">
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
