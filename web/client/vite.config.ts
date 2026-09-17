import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { env } from 'node:process';
import { demoVitePlugin } from './demoVitePlugin.ts';
import { projectionAiPlugin } from './projectionAiPlugin.ts';
import { tanstackRouter } from '@tanstack/router-plugin/vite';

const target = env.ASPNETCORE_URLS
  ? env.ASPNETCORE_URLS.split(';')[0]
  : 'http://localhost:5166';

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const demo = mode === 'demo';
  if (demo && command !== 'serve') {
    throw new Error('Demo mode is local only. Use npm run demo.');
  }
  return {
    plugins: [
      ...(demo ? [projectionAiPlugin(), demoVitePlugin()] : []),
      tanstackRouter({
        autoCodeSplitting: true,
        target: 'react',
      }),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: true,
      open: demo ? '/projects/9000000001/DEMOSPN001' : true,
      port: 5174,
      proxy: demo
        ? undefined
        : {
            '/health': {
              secure: false,
              target,
            },
            '/login': {
              secure: false,
              target,
            },
            '/signin-oidc': {
              secure: false,
              target,
            },
            '^/api': {
              secure: false,
              target,
            },
          },
    },
  };
});
