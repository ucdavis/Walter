import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/(authenticated)/reports')({
  component: RouteComponent,
});

function RouteComponent() {
  return <Outlet />;
}