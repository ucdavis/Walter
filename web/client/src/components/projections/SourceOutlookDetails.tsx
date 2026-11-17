import type { Ref } from 'react';
import {
  SourceCategoryWorksheet,
  type SourceCategoryWorksheetHandle,
} from '@/components/projections/SourceCategoryWorksheet.tsx';
import { SourceOutlookAppointments } from '@/components/projections/SourceOutlookAppointments.tsx';
import type { SourceOutlook } from '@/lib/projectionOutlook.ts';
import type {
  ProjectionNavigation,
  ProjectionResults,
} from '@/lib/projectionWorkspace.ts';
import type { ProjectionDraft } from '@/queries/projections.ts';

export function SourceOutlookDetails({
  draft,
  onNavigate,
  outlook,
  results,
  worksheetRef,
}: {
  draft: ProjectionDraft;
  onNavigate: (location: ProjectionNavigation) => void;
  outlook: SourceOutlook;
  results: ProjectionResults;
  worksheetRef?: Ref<SourceCategoryWorksheetHandle>;
}) {
  return (
    <section aria-label={`${outlook.label} details`} className="mt-8 space-y-6">
      <SourceCategoryWorksheet
        key={outlook.source.id}
        outlook={outlook}
        ref={worksheetRef}
        results={results}
      />
      <SourceOutlookAppointments
        appointments={draft.content.appointments}
        key={`staff-${outlook.source.id}`}
        onNavigate={onNavigate}
        results={results}
        source={outlook.source}
        sourceIdentity={outlook.label}
      />
    </section>
  );
}
