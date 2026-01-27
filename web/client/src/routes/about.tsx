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

        <main className="flex flex-col p-10 mt-6 flex-1">
          <div className="flex w-full max-w-xl flex-col md:mt-10 sm:max-w-[90%] md:max-w-[80%] xl:max-w-[50%]">
            <img alt="Dog outline logo" className="w-8" src="/walter.svg" />
            <h1 className="text-2xl font-proxima-bold">W.A.L.T.E.R.</h1>
            <p className="uppercase">
              warehouse analytics and ledger tools for enterprise reporting
            </p>
            <p className="mt-4 border-t border-main-border pt-4">
              Walter Warehouse Analytics & Ledger Tools is an enterprise-grade
              reporting application designed to give organizations a clear,
              trustworthy view of their financial and operational data—without
              the usual spreadsheet chaos. Developed by{' '}
              <a
                className="underline"
                href="https://computing.caes.ucdavis.edu/"
              >
                CRU
              </a>
            </p>
            <div className="flex gap-2 mt-4 border-b border-main-border pb-4">
              <Link className="btn btn-outline btn-primary btn-sm" to="/FAQs">
                FAQs
              </Link>
              <Link
                className="btn btn-outline btn-primary btn-sm"
                to="https://computing.caes.ucdavis.edu/documentation/walter"
              >
                Documentation
              </Link>
            </div>
            <Link className="btn btn-primary btn-lg mt-4" to="/">
              UC Davis Login
            </Link>
          </div>
          <div className="mt-auto items-start">
            <a
              href="https://caes.ucdavis.edu"
              rel="noopener noreferrer"
              target="_blank"
            >
              <img
                alt="CA&ES UC Davis Logo"
                className="w-36 opacity-50"
                src="/caes.svg"
              />
            </a>
            <p className="text-sm text-dark-font/80 mt-4">
              © {new Date().getFullYear()} UC Regents, Davis campus. All rights
              reserved.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
