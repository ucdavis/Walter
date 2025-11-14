import { ProjectChart } from '@/components/ProjectChart.tsx';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/(authenticated)/projects/')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <main className="flex-1 max-w-4xl">
      {/* Alerts */}
      {/* <AlertSection /> */}

      {/* Chart Section */}
      <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="mb-4">
          <span className="inline-block bg-blue-600 text-white px-3 py-1 text-xs rounded">
            DATA AS OF 11.9.2025
          </span>
        </div>
        <h1 className="mb-1">Dean&apos;s Office Allocation</h1>
        <p className="text-gray-500 text-sm mb-6">ADN100954-A0N0</p>
        <ProjectChart />
      </section>

      {/* Project Details */}
      {/* <ProjectDetails /> */}

      {/* Financial Details */}
      {/* <FinancialDetails /> */}

      {/* Personnel */}
      {/* <PersonnelSection /> */}
    </main>
  );
}
