import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/about')({
  component: About,
});

function About() {
  return (
    <div className="min-h-dvh bg-white">
      <div className="flex min-h-dvh">
        <aside className="hidden w-72 walter-login-pattern shrink-0 md:block">
          <div className="h-full border-r border-main-border" />
        </aside>

        <main className="flex flex-1">
          <div className="flex w-full max-w-xl flex-col p-10 mt-6 sm:max-w-[90%] md:max-w-[80%] xl:max-w-[50%]">
            <img alt="Dog outline logo" className="w-8" src="/walter.svg" />
            <h1 className="text-2xl font-proxima-bold">W.A.L.T.E.R.</h1>
            <p className="uppercase">
              warehouse analytics and ledger tools for enterprise reporting
            </p>
            <Link className="btn btn-primary btn-lg mt-8" to="/dashboard">
              UC Davis Login
            </Link>
          </div>
          <div className="mt-auto">Footer</div>
        </main>
      </div>
    </div>
  );
}
