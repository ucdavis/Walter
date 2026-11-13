import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useCallback, useRef, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectionDialog } from '@/components/projections/ProjectionDialog.tsx';

afterEach(cleanup);

function Editor({ customFocus = false }: { customFocus?: boolean }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [replacementTarget, setReplacementTarget] = useState(false);
  const initialFocusRef = useRef<HTMLInputElement>(null);
  const returnFocusTo = useCallback(
    () => document.getElementById('replacement-target'),
    []
  );
  return (
    <>
      <button onClick={() => setOpen(true)}>Open editor</button>
      {replacementTarget && (
        <button id="replacement-target">Updated funding</button>
      )}
      {open && (
        <ProjectionDialog
          initialFocusRef={customFocus ? initialFocusRef : undefined}
          onClose={() => setOpen(false)}
          returnFocusTo={customFocus ? returnFocusTo : undefined}
          title="Edit funding"
          wide={customFocus}
        >
          <input aria-label="Start date" ref={initialFocusRef} />
          <input
            aria-label="Notes"
            onChange={(event) => setValue(event.target.value)}
            value={value}
          />
          <button onClick={() => setReplacementTarget(true)}>
            Replace funding target
          </button>
        </ProjectionDialog>
      )}
    </>
  );
}

describe('projection dialog focus', () => {
  it('handles Escape cancellation and restores the opener', async () => {
    const user = userEvent.setup();
    render(<Editor />);
    const opener = screen.getByRole('button', { name: 'Open editor' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Edit funding' });
    const cancel = new Event('cancel', { bubbles: false, cancelable: true });
    fireEvent(dialog, cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('focuses the requested field once and resolves the return target when closing', async () => {
    const user = userEvent.setup();
    render(<Editor customFocus />);
    await user.click(screen.getByRole('button', { name: 'Open editor' }));
    expect(screen.getByLabelText('Start date')).toHaveFocus();

    const notes = screen.getByLabelText('Notes');
    await user.type(notes, 'Changed');
    expect(notes).toHaveValue('Changed');
    expect(notes).toHaveFocus();
    await user.click(
      screen.getByRole('button', { name: 'Replace funding target' })
    );

    fireEvent(
      screen.getByRole('dialog', { name: 'Edit funding' }),
      new Event('cancel', { cancelable: true })
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Updated funding' })
    ).toHaveFocus();
  });
});
