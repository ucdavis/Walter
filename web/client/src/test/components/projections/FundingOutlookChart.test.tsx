import { cloneElement, type ReactElement } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FundingOutlookChart,
  FundingOutlookTooltip,
  type OutlookSeries,
} from '@/components/projections/FundingOutlookChart.tsx';

vi.mock('recharts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('recharts')>()),
  ResponsiveContainer: ({
    children,
  }: {
    children: ReactElement<{ height: number; width: number }>;
  }) => cloneElement(children, { height: 320, width: 280 }),
}));
afterEach(cleanup);

function series(): OutlookSeries[] {
  return [
    {
      colorIndex: 0,
      contextLabel: 'COAST-1042 · Task 01',
      displayLabel: 'Fieldwork',
      emptyReason: 'No forecast data',
      id: 'source:1',
      identityLabel:
        'Long coastal research project COAST-1042 · Task 01 · Fieldwork',
      label: 'Long coastal research project · Task 01 · Fieldwork',
      months: [
        { actual: 0, forecast: 0, month: '2026-01', remaining: -1_234_567.89 },
      ],
      onSelect: vi.fn(),
    },
    {
      colorIndex: 1,
      contextLabel: 'FOOD-2017 · Task 01',
      displayLabel: 'Fieldwork',
      emptyReason: 'No forecast data',
      id: 'source:2',
      identityLabel: 'Food systems project FOOD-2017 · Task 01 · Fieldwork',
      label: 'Food systems project · Task 01 · Fieldwork',
      months: [{ actual: 0, forecast: 0, month: '2026-01', remaining: 0 }],
      onSelect: vi.fn(),
    },
  ];
}

function renderChart(entries = series()) {
  render(
    <FundingOutlookChart
      firstShortfallMonth={null}
      focused={false}
      forecastWindow={{ endMonth: '2026-01', startMonth: '2026-01' }}
      hidden={new Set()}
      onHideAll={vi.fn()}
      onShowAll={vi.fn()}
      onToggle={vi.fn()}
      series={entries}
    />
  );
  return entries;
}

describe('funding outlook chart labels', () => {
  it('keeps tooltip pointer movement from changing the chart month and exposes keyboard scrolling', () => {
    const chartMove = vi.fn();
    const chartFocus = vi.fn();
    const chartKeyDown = vi.fn();
    render(
      <div
        onFocus={chartFocus}
        onKeyDown={chartKeyDown}
        onMouseMove={chartMove}
      >
        <FundingOutlookTooltip
          active
          label="2026-01"
          payload={[{ dataKey: 'source:1', value: -1_234_567.89 }]}
          series={series()}
        />
      </div>
    );
    const balances = screen.getByRole('region', {
      name: 'Jan 2026 remaining balances',
    });
    fireEvent.mouseMove(within(balances).getByText('-$1,234,567.89'));
    fireEvent.focus(balances);
    fireEvent.keyDown(balances, { key: 'ArrowDown' });
    expect(chartMove).not.toHaveBeenCalled();
    expect(chartFocus).not.toHaveBeenCalled();
    expect(chartKeyDown).not.toHaveBeenCalled();
    expect(balances).toHaveAttribute('tabindex', '0');
  });
  it('keeps compact same-name tasks distinct and reveals full identity on keyboard focus without losing navigation', async () => {
    const user = userEvent.setup();
    const entries = renderChart();
    const legend = screen.getByRole('navigation', { name: 'Chart legend' });
    const first = within(legend).getByRole('button', {
      name: entries[0].label,
    });
    expect(first).toHaveTextContent('Fieldwork');
    expect(first).toHaveTextContent('COAST-1042 · Task 01');
    expect(first).not.toHaveTextContent('Long coastal research project');
    expect(
      within(legend).getByRole('button', { name: entries[1].label })
    ).toHaveTextContent('FOOD-2017 · Task 01');
    for (
      let index = 0;
      index < 10 && document.activeElement !== first;
      index++
    ) {
      await user.tab();
    }
    expect(first).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      entries[0].identityLabel!
    );
    await user.keyboard('{Enter}');
    expect(entries[0].onSelect).toHaveBeenCalledOnce();
  });

  it('reveals full line identity when hovering a compact legend or line-control label', async () => {
    const user = userEvent.setup();
    const entries = renderChart();
    const legend = screen.getByRole('navigation', { name: 'Chart legend' });
    const first = within(legend).getByRole('button', {
      name: entries[0].label,
    });
    await user.hover(first);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      entries[0].identityLabel!
    );
    await user.unhover(first);
    await user.click(screen.getByText(/Chart lines ·/));
    const checkbox = screen.getByRole('checkbox', { name: entries[1].label });
    await user.hover(checkbox.closest('label')!);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      entries[1].identityLabel!
    );
  });

  it('keeps each formatted value separate from wrapping identities and excludes absent values', () => {
    const entries = series();
    entries[0].displayLabel = 'UnbrokenTaskIdentifier'.repeat(12);
    render(
      <FundingOutlookTooltip
        active
        label="2026-01"
        payload={[
          { dataKey: 'source:1', value: -1_234_567.89 },
          { dataKey: 'source:2', value: 0 },
          { dataKey: 'source:2', value: null },
          { dataKey: 'missing', value: 17 },
        ]}
        series={entries}
      />
    );
    expect(screen.getByText('Jan 2026')).toBeInTheDocument();
    const terms = screen.getAllByRole('term');
    expect(terms).toHaveLength(2);
    expect(terms[0]).toHaveAccessibleName(entries[0].identityLabel!);
    expect(terms[0]).toHaveTextContent(entries[0].displayLabel);
    expect(
      screen.getAllByRole('definition').map((node) => node.textContent)
    ).toEqual(['-$1,234,567.89', '$0.00']);
  });
});
