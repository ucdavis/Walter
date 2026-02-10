import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { useHasRole } from '@/shared/auth/UserContext.tsx';

type Report = {
  id: string;
  title: string;
  url: string;
};

export function Reports() {
  const canViewAccruals = useHasRole('AccrualViewer');

  const reports = useMemo(() => {
    const availableReports: Report[] = [];

    if (canViewAccruals) {
      availableReports.push({
        id: 'accruals',
        title: 'Employee Vacation Accruals',
        url: '/accruals',
      });
    }

    return availableReports;
  }, [canViewAccruals]);

  if (reports.length === 0) {
    return (
      <div className="alert alert-info">
        <span>No reports available for your account.</span>
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {reports.map((report) => (
        <li key={report.id}>
          <Link className="text-xl link link-hover underline" to={report.url}>
            {report.title}
          </Link>
        </li>
      ))}
    </ul>
  );
}
