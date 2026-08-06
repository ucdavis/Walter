import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';

afterEach(cleanup);

describe('TooltipLabel', () => {
  it('associates the visible tooltip with its trigger', async () => {
    const user = userEvent.setup();
    render(
      <TooltipLabel label="Balance" tooltip="Available project balance" />
    );

    const trigger = screen.getByText('Balance').parentElement as HTMLElement;
    await user.hover(trigger);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.id).not.toBe('');
    expect(trigger).toHaveAttribute('aria-describedby', tooltip.id);
  });

  it('uses an interactive child as the only tooltip trigger', async () => {
    const user = userEvent.setup();
    render(
      <TooltipLabel
        asChild
        label={<button type="button">Inspect project</button>}
        tooltip="Open project details"
      />
    );

    const button = screen.getByRole('button', { name: 'Inspect project' });
    expect(button).toHaveAttribute('data-tooltip-placement', 'top');
    expect(button.parentElement).not.toHaveAttribute('data-tooltip-placement');

    await user.tab();

    const tooltip = await screen.findByRole('tooltip');
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute('aria-describedby', tooltip.id);
  });

  it('dismisses the tooltip with Escape while preserving trigger focus', async () => {
    const user = userEvent.setup();
    render(
      <TooltipLabel label="Balance" tooltip="Available project balance" />
    );

    await user.tab();
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(screen.getByText('Balance').parentElement).toHaveFocus();
  });

  it('keeps repeated display values out of the Tab order when requested', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Before</button>
        <TooltipLabel
          focusable={false}
          label="Department 123"
          screenReaderLabel="Department of Example Studies"
          tooltip="Department of Example Studies"
        />
        <button type="button">After</button>
      </>
    );

    const trigger = screen.getByText('Department 123')
      .parentElement as HTMLElement;

    await user.tab();
    expect(screen.getByRole('button', { name: 'Before' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();

    expect(screen.getByText('Department of Example Studies')).toHaveClass(
      'sr-only'
    );

    await user.hover(trigger);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Department of Example Studies'
    );
  });
});
