import { createFileRoute } from '@tanstack/react-router';
import { VacationAccrualAbout } from '@/components/accrual/VacationAccrualAbout.tsx';

export const Route = createFileRoute('/(authenticated)/accruals/about')({
  component: RouteComponent,
});

function RouteComponent() {
  return <VacationAccrualAbout />;
}
