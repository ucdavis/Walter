import { Link } from '@tanstack/react-router';
import { PageEmpty } from '@/components/states/PageEmpty.tsx';

export function ProjectionUnavailable({ iamId }: { iamId: string }) {
  return (
    <main className="container">
      <PageEmpty message="Projections are not available." />
      <div className="mt-6 text-center">
        <Link
          className="btn btn-outline"
          params={{ iamId }}
          to="/projects/$iamId"
        >
          Back to projects
        </Link>
      </div>
    </main>
  );
}

export function ProjectionSessionNotice() {
  return (
    <p className="alert alert-info my-4" role="status">
      Projections have been turned off. You can finish and save this plan before
      leaving. You won&apos;t be able to reopen it until projections are
      available again.
    </p>
  );
}
