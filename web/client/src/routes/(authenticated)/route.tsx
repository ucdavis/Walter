import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { RouterContext } from '../../main.tsx';
import { meQueryOptions } from '../../queries/user.ts';
import { UserProvider } from '@/shared/auth/UserContext.tsx';

export const Route = createFileRoute('/(authenticated)')({
  beforeLoad: async ({ context }: { context: RouterContext }) => {
    await context.queryClient.ensureQueryData(meQueryOptions());
  },
  component: () => (
    <UserProvider>
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
              <span className="text-white">W</span>
            </div>
            <span>Walter</span>
          </div>
          <nav className="flex items-center gap-6">
            <a className="text-gray-600 hover:text-gray-900" href="#">
              <Link to="/projects">Projects</Link>
            </a>
            <a className="text-gray-600 hover:text-gray-900" href="#">
              Ipsum
            </a>
            <a className="text-gray-600 hover:text-gray-900" href="#">
              Account
            </a>
          </nav>
        </div>
      </header>
      <Outlet />
    </UserProvider>
  ),
});
