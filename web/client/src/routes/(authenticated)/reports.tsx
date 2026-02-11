import { Reports } from '@/components/reports/Reports.tsx';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/(authenticated)/reports')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="container">
      <Reports />
    </div>
  );
}
