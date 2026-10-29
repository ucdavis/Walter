import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Plugin } from 'vite';

// Serve MSW only in demo mode. No worker or synthetic data is copied into the
// normal production bundle, and this server has no API proxy to fall back to.
export function demoVitePlugin(): Plugin {
  return {
    configureServer(server) {
      const require = createRequire(import.meta.url);
      const worker = readFileSync(require.resolve('msw/mockServiceWorker.js'));
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] === '/mockServiceWorker.js') {
          res.setHeader('Content-Type', 'application/javascript');
          res.end(worker);
        } else if (/^\/api(?:\/|\?|$)/.test(req.url ?? '')) {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              message: 'The demo worker has not handled this request.',
            })
          );
        } else {
          next();
        }
      });
    },
    name: 'walter-local-demo',
    transformIndexHtml(html) {
      // The regular index includes analytics before application startup.
      return html.replace(
        /\s*<!-- Google tag[\S\s]*?<\/script>\s*<script>[\S\s]*?<\/script>/,
        ''
      );
    },
  };
}
