import CardsRow from '@/components/project/CardsRow.tsx';
import { useUser } from '@/shared/auth/UserContext.tsx';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/(authenticated)/')({
  component: RouteComponent,
});

function RouteComponent() {
  const user = useUser();
  return (
    <div className="container">
      home dash
      <h2 className="h2 mt-8">Alerts</h2>
      <div className="flex flex-col gap-4 mt-4">
        <div className="alert alert-error alert-soft" role="alert">
          <span>Error! Task failed successfully.</span>
        </div>
        <div className="alert alert-error alert-soft" role="alert">
          <span>Error! Task failed successfully.</span>
        </div>
      </div>
      <h2 className="h2 mt-8">Recently Viewed</h2>
      <CardsRow />
    </div>
  );
}
