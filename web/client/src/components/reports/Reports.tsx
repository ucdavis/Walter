import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { useHasRole } from '@/shared/auth/UserContext.tsx';
import { PageEmpty } from '../states/PageEmpty.tsx';

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
      <PageEmpty message="You don't have access to any reports. We're going to dig up some new ones for you soon." />
    );
  }

  return (
    <section className="mt-8 mb-10">
      <h1 className="h1">Reports</h1>

      <ul className="space-y-4">
        {reports.map((report) => (
          <li key={report.id}>
            <Link className="text-xl link link-hover underline" to={report.url}>
              {report.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
