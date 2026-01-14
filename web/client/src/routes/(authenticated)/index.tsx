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
      <div
        className="py-10
      mx-auto w-full
      sm:max-w-[90%]
      md:max-w-[80%]
      xl:max-w-[66%]
    "
      >
        <h1 className="text-2xl font-proxima-bold">W.A.L.T.E.R.</h1>
        <p className="uppercase">
          warehouse analytics and ledger tools for enterprise reporting
        </p>
        Omni Here
      </div>
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
