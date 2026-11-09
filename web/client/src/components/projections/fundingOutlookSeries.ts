import type { OutlookSeries } from '@/components/projections/FundingOutlookChart.tsx';
import type { ProjectionOutlook } from '@/lib/projectionOutlook.ts';

export function fundingOutlookSeries(
  outlook: ProjectionOutlook,
  grouped: boolean,
  selectedSourceId: number | null,
  onSelectSource: (id: number) => void,
  onExpandGroup: (id: string) => void
): OutlookSeries[] {
  if (selectedSourceId === null && grouped) {
    return outlook.groups.map((group, colorIndex) => ({
      colorIndex,
      emptyReason: group.sources.every(({ outside }) => outside)
        ? 'Outside forecast period'
        : 'No forecast data in this period',
      id: group.id,
      label: group.label,
      months: group.months,
      onSelect: () => {
        if (group.sources.length === 1) {
          onSelectSource(group.sources[0].source.id);
        } else {
          onExpandGroup(group.id);
        }
      },
    }));
  }
  return outlook.sources
    .map((source, colorIndex) => ({
      colorIndex,
      emptyReason: source.outside
        ? 'Outside forecast period'
        : 'No forecast data in this period',
      id: `source:${source.source.id}`,
      label: source.label,
      months: source.months,
      onSelect: () => onSelectSource(source.source.id),
    }))
    .filter(
      ({ id }) =>
        selectedSourceId === null || id === `source:${selectedSourceId}`
    );
}
