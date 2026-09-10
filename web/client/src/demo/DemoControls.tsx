import { DEFAULT_DEMO_SEED, DEMO_IAM_ID } from './data.ts';
import { saveSettings, settings } from './settings.ts';

function regenerate(reset = false) {
  saveSettings({
    asOf: new Date().toISOString().slice(0, 7),
    seed: reset
      ? DEFAULT_DEMO_SEED
      : crypto.getRandomValues(new Uint32Array(1))[0],
  });
  // Reload clears every query and route cache together, so two datasets can
  // never be mixed while navigating between a summary and its detail screen.
  window.location.reload();
}

export function DemoControls() {
  return (
    <aside
      aria-label="Demo controls"
      className="bg-primary text-primary-content py-2 text-sm"
    >
      <div className="container flex flex-wrap items-center justify-between gap-2">
        <span>Demo data · Morgan Reed · Snapshot {settings.asOf}</span>
        <div className="flex items-center gap-4">
          <a className="underline" href={`/projects/${DEMO_IAM_ID}`}>
            All projects
          </a>
          <button
            className="underline cursor-pointer"
            onClick={() => regenerate()}
            type="button"
          >
            New dataset
          </button>
          <button
            className="underline cursor-pointer"
            onClick={() => regenerate(true)}
            type="button"
          >
            Reset demo
          </button>
        </div>
      </div>
    </aside>
  );
}
