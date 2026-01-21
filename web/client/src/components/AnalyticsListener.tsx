import { useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';

export function AnalyticsListener() {
  const router = useRouter();

  useEffect(() => {
    // Fire initial page view
    window.gtag?.('event', 'page_view', {
      page_path: window.location.pathname,
    });

    // Fire on route changes
    return router.subscribe('onResolved', () => {
      window.gtag?.('event', 'page_view', {
        page_path: window.location.pathname,
      });
    });
  }, [router]);

  return null;
}
