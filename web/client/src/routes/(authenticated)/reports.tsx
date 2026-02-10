import { Reports } from '@/components/reports/Reports.tsx';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/(authenticated)/reports')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="container">
      <section className="mt-8 mb-10">
        <h1 className="h1">Reports</h1>
      </section>
      <Reports />
    </div>
  );
}
