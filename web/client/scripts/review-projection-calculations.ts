import { stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Transform the existing TypeScript modules locally; do not start an HTTP server.
const clientRoot = fileURLToPath(new URL('../', import.meta.url));
const vite = await createServer({
  configFile: false,
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
  resolve: { alias: { '@': `${clientRoot}src` } },
  root: clientRoot,
  server: { hmr: false, middlewareMode: true, watch: null },
});
try {
  const { reviewProjectionCalculations } = await vite.ssrLoadModule(
    '/src/test/lib/piProjection.review.ts'
  );
  stdout.write(`${JSON.stringify(reviewProjectionCalculations(), null, 2)}\n`);
} finally {
  await vite.close();
}
