import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/about')({
  component: About,
});

function About() {
  return (
    <div className="min-h-dvh bg-white">
      <div className="flex min-h-dvh">
        <aside className="hidden w-72 walter-login-pattern shrink-0 md:block">
          <div className="h-full border-r" />
        </aside>

        <main className="flex flex-1">
          <div className="mx-auto flex w-full max-w-2xl flex-col justify-center px-6 py-10">
            text
          </div>
        </main>
      </div>
    </div>
  );
}
