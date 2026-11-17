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
      contextLabel: group.projectNumber ?? undefined,
      emptyReason: group.sources.every(({ outside }) => outside)
        ? 'Outside forecast period'
        : 'No forecast data in this period',
      id: group.id,
      identityLabel: [group.label, group.projectNumber]
        .filter(Boolean)
        .join(' · '),
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
      contextLabel: [
        source.source.projectNumber,
        source.source.taskNumber && `Task ${source.source.taskNumber}`,
      ]
        .filter(Boolean)
        .join(' · '),
      displayLabel:
        source.source.name === source.source.projectName &&
        source.source.projectNumber &&
        outlook.sources.filter(
          (entry) => entry.source.projectNumber === source.source.projectNumber
        ).length > 1
          ? (source.source.taskName ?? source.source.name)
          : source.source.name,
      emptyReason: source.outside
        ? 'Outside forecast period'
        : 'No forecast data in this period',
      id: `source:${source.source.id}`,
      identityLabel: [
        ...new Set(
          [
            source.source.projectName,
            source.source.name,
            source.source.projectNumber,
            source.source.taskNumber && `Task ${source.source.taskNumber}`,
            source.source.taskName !== source.source.taskNumber
              ? source.source.taskName
              : null,
          ].filter(Boolean)
        ),
      ].join(' · '),
      label: source.label,
      months: source.months,
      onSelect: () => onSelectSource(source.source.id),
    }))
    .filter(
      ({ id }) =>
        selectedSourceId === null || id === `source:${selectedSourceId}`
    );
}
