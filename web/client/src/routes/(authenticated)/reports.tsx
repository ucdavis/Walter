import { createFileRoute, Link } from '@tanstack/react-router';
import { useHasRole } from '@/shared/auth/UserContext.tsx';

export const Route = createFileRoute('/(authenticated)/reports')({
  component: RouteComponent,
});

function RouteComponent() {
  const canViewAccruals = useHasRole('AccrualViewer');

  return (
    <div className="container">
      <section className="mt-8 mb-10">
        <h1 className="h1">Reports</h1>
      </section>

      <ul className="space-y-4">
        {canViewAccruals && (
          <li>
            <Link className="text-xl link link-hover underline" to="/accruals">
              Employee Vacation Accruals
            </Link>
          </li>
        )}
      </ul>
    </div>
  );
}
