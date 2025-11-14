import { createFileRoute, Outlet } from '@tanstack/react-router';
import { ProjectsSidebar } from '@/components/ProjectsSidebar.tsx';

export const Route = createFileRoute('/(authenticated)/projects')({
  component: RouteComponent,
  // before load the project data
});

function RouteComponent() {
  return (
    <div className="max-w-[1600px] mx-auto px-6 py-8">
      <div className="flex gap-8">
        {/* Sticky Sidebar */}
        <ProjectsSidebar />

        {/* Main Content */}
        <Outlet />
      </div>
    </div>
  );
}
