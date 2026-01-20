import { createFileRoute, Outlet } from '@tanstack/react-router';
import { RouterContext } from '../../main.tsx';
import { meQueryOptions } from '../../queries/user.ts';
import { UserProvider } from '@/shared/auth/UserContext.tsx';
import Header from '@/components/project/header.tsx';

export const Route = createFileRoute('/(authenticated)')({
  beforeLoad: async ({ context }: { context: RouterContext }) => {
    await context.queryClient.ensureQueryData(meQueryOptions());
  },
  component: () => (
    <UserProvider>
      <Header />

      <Outlet />
    </UserProvider>
  ),
});
