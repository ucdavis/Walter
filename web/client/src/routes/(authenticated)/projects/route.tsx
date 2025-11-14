import { createFileRoute, Outlet } from '@tanstack/react-router';
import { ProjectsSidebar } from './components/ProjectsSidebar.tsx';

export const Route = createFileRoute('/(authenticated)/projects')({
  component: RouteComponent,
  // before load the project data
});

function RouteComponent() {
  return (
    <div className="flex h-[calc(100vh_-_<header_height>)]">
      {/* Floating / sticky sidebar */}
      <aside className="w-72 border-r bg-white/80 backdrop-blur sticky top-0 h-screen">
        <ProjectsSidebar />
      </aside>

      {/* Main content area */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
