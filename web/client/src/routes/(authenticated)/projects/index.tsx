import { useUser } from '@/shared/auth/UserContext.tsx';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/(authenticated)/projects/')({
  component: RouteComponent,
});

function RouteComponent() {
  const user = useUser();
  return (
    <div className="min-h-screen bg-base-100">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center">
          <h1 className="text-4xl font-bold">
            Welcome to the Projects Page, {user.name}!
          </h1>
        </div>
      </div>
    </div>
  );
}
