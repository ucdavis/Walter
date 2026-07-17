import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { useHasRole } from '@/shared/auth/UserContext.tsx';
import { PageEmpty } from '../states/PageEmpty.tsx';
import {
  ArrowRightIcon,
  BanknotesIcon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline';

type Report = {
  description: string;
  Icon: typeof CalendarDaysIcon;
  id: string;
  title: string;
  url: string;
};

export function Reports() {
  const canViewAccruals = useHasRole('AccrualViewer');
  const canViewDepartmentBalances = useHasRole('DepartmentViewer');

  const reports = useMemo(() => {
    const availableReports: Report[] = [];

    if (canViewAccruals) {
      availableReports.push({
        description:
          'Review vacation accrual balances by department and drill into employee-level detail.',
        Icon: CalendarDaysIcon,
        id: 'accruals',
        title: 'Employee Vacation Accruals',
        url: '/accruals',
      });
    }

    if (canViewDepartmentBalances) {
      availableReports.push({
        description:
          'Filter chartstring segments, choose table fields, and export department balance results.',
        Icon: BanknotesIcon,
        id: 'department-balances',
        title: 'Department Balances',
        url: '/reports/department-balances',
      });
    }

    return availableReports;
  }, [canViewAccruals, canViewDepartmentBalances]);

  if (reports.length === 0) {
    return (
      <PageEmpty message="You don't have access to any reports. We're going to dig up some new ones for you soon." />
    );
  }

  return (
    <section className="mt-8 mb-10">
      <div className="mb-6">
        <h1 className="h1">Reports</h1>
        <p className="mt-2 max-w-2xl text-base-content/70">
          Open the financial and operational reports available to your role.
        </p>
      </div>

      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {reports.map((report) => (
          <li key={report.id}>
            <Link
              className="border-main-border group block h-full rounded-sm border bg-base-100 p-5 transition hover:bg-[#F2F6FC] hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              to={report.url}
            >
              <div className="flex h-full flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <report.Icon className="h-6 w-6" />

                  <ArrowRightIcon className="mt-1 h-5 w-5 shrink-0 text-base-content/40 transition group-hover:translate-x-1 group-hover:text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-proxima-bold">{report.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-base-content/70">
                    {report.description}
                  </p>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
