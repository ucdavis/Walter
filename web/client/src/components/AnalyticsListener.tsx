import { useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';
import { applyRumRouteMetadata, resolveRumRouteMetadata } from '@/lib/rum.ts';

export function AnalyticsListener() {
  const router = useRouter();

  useEffect(() => {
    const trackPageView = () => {
      const path = window.location.pathname;
      const metadata = resolveRumRouteMetadata(router.state.matches, path);

      applyRumRouteMetadata(metadata);

      window.gtag?.('event', 'page_view', {
        page_path: path,
      });
    };

    trackPageView();

    return router.subscribe('onResolved', trackPageView);
  }, [router]);

  return null;
}
