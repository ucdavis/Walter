import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { createProjectionPreviewRouter } from '@/dev/projections/router.tsx';
import '@/main.css';

// This second HTML entry is served by Vite locally and is not a production build input.
if (import.meta.env.DEV) {
  const router = createProjectionPreviewRouter();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  );
}
