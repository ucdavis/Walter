import { createFileRoute, notFound, redirect } from '@tanstack/react-router';
import { PageEmpty } from '@/components/states/PageEmpty.tsx';

export const Route = createFileRoute(
  '/(authenticated)/projection-designs/$iamId'
)({
  loader: ({ params: { iamId } }) => {
    if (import.meta.env.MODE !== 'demo') {
      throw notFound();
    }
    throw redirect({
      params: { iamId },
      replace: true,
      to: '/guided-projections/$iamId',
    });
  },
  notFoundComponent: () => (
    <div className="container py-8">
      <PageEmpty message="Guided projections are available in the local demo portfolio." />
    </div>
  ),
});
