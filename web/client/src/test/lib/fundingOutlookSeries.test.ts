import { describe, expect, it, vi } from 'vitest';
import { fundingOutlookSeries } from '@/components/projections/fundingOutlookSeries.ts';
import { buildProjectionOutlook } from '@/lib/projectionOutlook.ts';
import { computePiProjection } from '@/lib/piProjection.ts';
import { createSalaryExample } from '@/test/fixtures/projections.ts';

function outlook() {
  const draft = createSalaryExample();
  draft.content.fundingSources.forEach((source, index) =>
    Object.assign(source, {
      name: 'A very long project title',
      projectName: 'A very long project title',
      projectNumber: `P${index + 1}`,
      taskName: 'Fieldwork',
      taskNumber: '01',
    })
  );
  draft.content.fundingSources.push(
    ...draft.content.fundingSources.map((source) => ({
      ...source,
      id: source.id + 2,
      taskNumber: '02',
    }))
  );
  return buildProjectionOutlook(draft, computePiProjection(draft));
}

describe('funding outlook display labels', () => {
  it('keeps a single-task project human-readable when its task name is only a code', () => {
    const draft = createSalaryExample();
    Object.assign(draft.content.fundingSources[0], {
      name: 'Coastal research award',
      projectName: 'Coastal research award',
      taskName: 'TASK01',
      taskNumber: 'TASK01',
    });
    const data = buildProjectionOutlook(draft, computePiProjection(draft));
    const entry = fundingOutlookSeries(data, false, null, vi.fn(), vi.fn())[0];
    expect(entry.displayLabel).toBe('Coastal research award');
    expect(entry.contextLabel).toBe('SYNTHETIC-1 · Task TASK01');
    expect(entry.identityLabel).toBe(
      'Coastal research award · SYNTHETIC-1 · Task TASK01'
    );
  });
  it('shortens repeated project names while keeping project/task identities, balances, and navigation', () => {
    const data = outlook();
    const onSelect = vi.fn();
    const entries = fundingOutlookSeries(data, false, null, onSelect, vi.fn());
    expect(entries.map(({ displayLabel }) => displayLabel)).toEqual([
      'Fieldwork',
      'Fieldwork',
      'Fieldwork',
      'Fieldwork',
    ]);
    expect(entries.map(({ contextLabel }) => contextLabel)).toEqual([
      'P1 · Task 01',
      'P2 · Task 01',
      'P1 · Task 02',
      'P2 · Task 02',
    ]);
    for (const [index, entry] of entries.entries()) {
      expect(entry.identityLabel).toContain('A very long project title');
      expect(entry.identityLabel).toContain(
        data.sources[index].source.projectNumber!
      );
      expect(
        entry.identityLabel!.split('A very long project title')
      ).toHaveLength(2);
      expect(entry.identityLabel).toContain(
        `Task ${data.sources[index].source.taskNumber}`
      );
      expect(entry.label).toBe(data.sources[index].label);
      expect(entry.months).toBe(data.sources[index].months);
      expect(entry.colorIndex).toBe(index);
    }
    entries[1].onSelect();
    expect(onSelect).toHaveBeenCalledWith(2);
    const focused = fundingOutlookSeries(data, false, 2, onSelect, vi.fn());
    expect(focused[0].colorIndex).toBe(1);
    expect(focused[0].months).toBe(data.sources[1].months);
  });

  it('preserves a user-renamed task title and project grouping labels', () => {
    const data = outlook();
    data.sources[0].source.name = 'Renamed fieldwork';
    expect(
      fundingOutlookSeries(data, false, null, vi.fn(), vi.fn())[0].displayLabel
    ).toBe('Renamed fieldwork');
    const grouped = fundingOutlookSeries(data, true, null, vi.fn(), vi.fn());
    expect(grouped[0].label).toBe(data.groups[0].label);
    expect(grouped[0].contextLabel).toBe('P1');
    expect(grouped[0].months).toBe(data.groups[0].months);
  });
});
