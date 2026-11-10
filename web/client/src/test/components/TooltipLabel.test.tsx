import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';

afterEach(cleanup);

it('shows a card on focus, dismisses on Escape, and preserves click actions', async () => {
  const user = userEvent.setup();
  const onClick = vi.fn();
  render(
    <TooltipLabel
      asChild
      label={<button onClick={onClick}>Edit month</button>}
      tooltip={<div>Month details</div>}
      variant="card"
    />
  );
  await user.tab();
  expect(await screen.findByRole('tooltip')).toHaveTextContent('Month details');
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  await user.tab();
  await user.tab({ shift: true });
  await screen.findByRole('tooltip');
  await user.keyboard('{Enter}');
  expect(onClick).toHaveBeenCalledOnce();
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

it('supports clicking a warning card open, outside dismissal, and hover into the card', async () => {
  const user = userEvent.setup();
  render(
    <>
      <TooltipLabel
        asChild
        clickToOpen
        label={<button>Funding gaps</button>}
        tooltip={<div>Periods with unassigned funding</div>}
        variant="card"
      />
      <button>Elsewhere</button>
    </>
  );
  await user.click(screen.getByRole('button', { name: 'Funding gaps' }));
  expect(await screen.findByRole('tooltip')).toHaveTextContent(
    'Periods with unassigned funding'
  );
  await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  await user.hover(screen.getByRole('button', { name: 'Funding gaps' }));
  const card = await screen.findByRole('tooltip');
  await user.hover(card);
  expect(card).toBeInTheDocument();
  await user.keyboard('{Escape}');
  await waitFor(() =>
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  );
});
