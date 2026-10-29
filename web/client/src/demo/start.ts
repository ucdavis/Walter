import { setupWorker } from 'msw/browser';
import { createDemoHandlers } from './handlers.ts';
import { createDemoData } from './data.ts';
import { DemoControls } from './DemoControls.tsx';
import { saveSettings, settings } from './settings.ts';

export async function startDemo() {
  if (
    !import.meta.env.DEV ||
    import.meta.env.MODE !== 'demo' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
  ) {
    throw new Error(
      'Demo mode is only available on the local development server.'
    );
  }
  saveSettings(settings);
  const worker = setupWorker(
    ...createDemoHandlers(createDemoData(settings.seed, settings.asOf))
  );
  await worker.start({ onUnhandledRequest: 'bypass', quiet: true });
  return DemoControls;
}
