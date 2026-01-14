import RecentActivity from '@/components/project/RecentActivity.tsx';
import { useUser } from '@/shared/auth/UserContext.tsx';
import { createFileRoute } from '@tanstack/react-router';
import {
  ExclamationCircleIcon,
  InformationCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

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
      <h2 className="h2 mt-16">Alerts</h2>
      <div className="mt-4 flex flex-col gap-4">
        <div className="alert alert-error alert-soft" role="alert">
          <ExclamationCircleIcon className="h-5 w-5" />
          <span>Error! Task failed successfully.</span>
        </div>

        <div className="alert alert-info alert-soft" role="alert">
          <InformationCircleIcon className="h-5 w-5" />
          <span>Info! Task failed successfully.</span>
        </div>

        <div className="alert alert-warning alert-soft" role="alert">
          <ExclamationTriangleIcon className="h-5 w-5" />
          <span>Warning! Task failed successfully.</span>
        </div>
      </div>
      <h2 className="h2 mt-16">Recently Viewed</h2>
      <RecentActivity />
      <div className="tabs mt-16" role="tablist">
        <a className="text-2xl tab tab-active ps-0" role="tab">
          Projects
        </a>
        <a className="text-2xl tab" role="tab">
          Personnel
        </a>
        <a className="text-2xl tab" role="tab">
          Expenditures
        </a>
      </div>
    </div>
  );
}
