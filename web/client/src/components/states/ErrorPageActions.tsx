import { Link } from '@tanstack/react-router';

export function ErrorPageActions({ onRetry }: { onRetry?: () => void }) {
  return (
    <>
      <button className="btn btn-primary" onClick={onRetry} type="button">
        Try again
      </button>
      <button
        className="btn btn-outline"
        onClick={() => window.location.reload()}
        type="button"
      >
        Reload page
      </button>
      <Link className="btn btn-ghost" to="/">
        Return home
      </Link>
    </>
  );
}
