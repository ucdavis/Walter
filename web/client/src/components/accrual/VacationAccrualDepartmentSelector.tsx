import {
  ArrowRightIcon,
  BuildingOffice2Icon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline';
import { Link } from '@tanstack/react-router';
import { PageEmpty } from '@/components/states/PageEmpty.tsx';
import {
  type AccrualDepartmentBreakdownRow,
  type AccrualOverviewResponse,
} from '@/queries/accrual.ts';

interface VacationAccrualDepartmentSelectorProps {
  data: AccrualOverviewResponse;
}

function sortDepartments(
  departments: AccrualDepartmentBreakdownRow[]
): AccrualDepartmentBreakdownRow[] {
  return [...departments].sort((left, right) => {
    const departmentComparison = left.department.localeCompare(
      right.department,
      'en-US'
    );

    if (departmentComparison !== 0) {
      return departmentComparison;
    }

    return left.departmentCode.localeCompare(right.departmentCode, 'en-US');
  });
}

export function VacationAccrualDepartmentSelector({
  data,
}: VacationAccrualDepartmentSelectorProps) {
  if (data.totalEmployees === 0) {
    return (
      <PageEmpty message="No vacation accrual balances are available for department selection yet." />
    );
  }

  const departments = sortDepartments(data.departmentBreakdown);

  return (
    <main className="mt-8">
      <div className="container">
        <div className="mx-auto max-w-5xl">
          <section className="section-margin">
            <div className="space-y-2">
              <div className="badge badge-outline badge-primary">
                Vacation Accruals
              </div>
              <h1 className="h1">Select a Department</h1>
              <p className="max-w-3xl text-lg text-base-content/70">
                Choose a department to open its vacation accrual detail.
              </p>
            </div>

            <div className="mt-8 overflow-hidden rounded-md border border-main-border bg-base-100">
              <div className="divide-y divide-main-border">
                {departments.map((department) => (
                  <Link
                    className="group flex min-h-16 items-center gap-4 px-4 py-3 text-base-content no-underline transition-colors hover:bg-base-200 focus:outline-none focus-visible:bg-base-200"
                    key={department.departmentCode}
                    params={{ departmentCode: department.departmentCode }}
                    to="/accruals/department/$departmentCode"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
                      <BuildingOffice2Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-proxima-bold text-lg">
                        {department.department}
                      </span>
                      <span className="text-sm text-base-content/60">
                        Department {department.departmentCode}
                      </span>
                    </span>
                    <span className="hidden text-sm text-base-content/60 sm:block">
                      {department.headcount.toLocaleString('en-US')}{' '}
                      employees
                    </span>
                    <ArrowRightIcon className="h-5 w-5 shrink-0 text-base-content/45 transition-transform group-hover:translate-x-1" />
                  </Link>
                ))}

                <Link
                  className="group flex min-h-16 items-center gap-4 bg-base-200/70 px-4 py-3 text-base-content no-underline transition-colors hover:bg-base-300 focus:outline-none focus-visible:bg-base-300"
                  to="/accruals/overview"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-secondary/20 text-base-content">
                    <Squares2X2Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-proxima-bold text-lg">
                      All departments overview
                    </span>
                    <span className="text-sm text-base-content/60">
                      Open the college-wide accrual summary
                    </span>
                  </span>
                  <ArrowRightIcon className="h-5 w-5 shrink-0 text-base-content/45 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
