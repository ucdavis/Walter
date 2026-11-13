import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFundingSummaryMotion } from '@/components/projections/useFundingSummaryMotion.ts';

function Warning({ hasWarnings = true }: { hasWarnings?: boolean }) {
  const {
    animating,
    containerRef,
    contentRef,
    minimized,
    minimizeRef,
    noticeRef,
    restoreRef,
    toggle,
  } = useFundingSummaryMotion(hasWarnings);
  return (
    <>
      <div ref={containerRef}>
        <div hidden={minimized}>
          {hasWarnings && (
            <section aria-label="Funding summary" ref={noticeRef}>
              <svg aria-hidden="true" data-funding-summary-icon />
              <p>Warning details stay full size.</p>
              <button onClick={toggle} ref={minimizeRef}>
                Minimize
              </button>
            </section>
          )}
        </div>
        <div ref={contentRef}>
          <h1>Plan</h1>
          {hasWarnings && minimized && (
            <button aria-label="Restore" onClick={toggle} ref={restoreRef}>
              <svg aria-hidden="true" />
            </button>
          )}
          <output>{animating ? 'Moving' : 'Settled'}</output>
        </div>
      </div>
      <button>Elsewhere</button>
    </>
  );
}

interface Motion {
  cancel: ReturnType<typeof vi.fn>;
  finish: () => void;
  reject: () => void;
}
let motions: Motion[];
let preference: EventTarget & { matches: boolean };
const originalAnimate = Object.getOwnPropertyDescriptor(
  Element.prototype,
  'animate'
);

beforeEach(() => {
  motions = [];
  preference = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => preference)
  );
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: vi.fn(() => {
      let finish!: () => void;
      let reject!: () => void;
      const finished = new Promise<void>((resolve, fail) => {
        finish = resolve;
        reject = () => fail(new DOMException('Cancelled', 'AbortError'));
      });
      const cancel = vi.fn(reject);
      motions.push({ cancel, finish, reject });
      return { cancel, finished };
    }),
  });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: Element) {
      if (this.tagName === 'svg') {
        return new DOMRect(40, 40, 20, 20);
      }
      if (this.getAttribute('aria-label') === 'Restore') {
        return new DOMRect(420, 40, 32, 32);
      }
      return new DOMRect(20, 20, 640, 160);
    }
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalAnimate) {
    Object.defineProperty(Element.prototype, 'animate', originalAnimate);
  } else {
    Reflect.deleteProperty(Element.prototype, 'animate');
  }
});
const overlays = () =>
  document.querySelectorAll<HTMLElement>('[data-funding-summary-motion]');
async function finish() {
  await act(async () => {
    motions.forEach((motion) => motion.finish());
  });
}

describe('funding summary fold motion', () => {
  it('keeps one icon inside the folding surface and restores real controls without stealing later focus', async () => {
    const user = userEvent.setup();
    render(<Warning />);
    await user.click(screen.getByRole('button', { name: 'Minimize' }));
    const restore = screen.getByRole('button', { name: 'Restore' });
    expect(restore).toHaveFocus();
    expect(screen.getByText('Moving')).toBeInTheDocument();
    expect(overlays()).toHaveLength(2);
    expect(overlays()[0].querySelectorAll('svg')).toHaveLength(1);
    for (const overlay of overlays()) {
      expect(overlay).toHaveAttribute('aria-hidden', 'true');
      expect(overlay.inert).toBe(true);
    }
    expect(
      overlays()[1].querySelector('[data-funding-summary-icon]')
    ).toHaveStyle({ visibility: 'hidden' });
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    await finish();
    expect(overlays()).toHaveLength(0);
    expect(restore.style.opacity).toBe('');
    expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus();
    await user.click(restore);
    expect(screen.getByRole('button', { name: 'Minimize' })).toHaveFocus();
    await finish();
    expect(
      screen.getByRole('region', { name: 'Funding summary' })
    ).toBeVisible();
    expect(screen.getByText('Settled')).toBeInTheDocument();
  });

  it('cancels a rapid reversal and ignores the old completion while the new fold runs', async () => {
    const user = userEvent.setup();
    render(<Warning />);
    await user.click(screen.getByRole('button', { name: 'Minimize' }));
    const previous = [...motions];
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    expect(
      previous.every((motion) => motion.cancel.mock.calls.length === 1)
    ).toBe(true);
    await act(async () => {
      previous.forEach((motion) => motion.finish());
    });
    expect(overlays()).toHaveLength(2);
    expect(screen.getByText('Moving')).toBeInTheDocument();
    await finish();
    expect(overlays()).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Minimize' })).toHaveFocus();
  });

  it.each(['resize', 'preference', 'rejection', 'warnings removed', 'unmount'])(
    'cleans up interrupted motion on %s',
    async (interruption) => {
      const user = userEvent.setup();
      const view = render(<Warning />);
      await user.click(screen.getByRole('button', { name: 'Minimize' }));
      const restore = screen.getByRole('button', { name: 'Restore' });
      await act(async () => {
        if (interruption === 'resize') {
          window.dispatchEvent(new Event('resize'));
        } else if (interruption === 'preference') {
          preference.matches = true;
          preference.dispatchEvent(new Event('change'));
        } else if (interruption === 'rejection') {
          motions[0].reject();
        } else if (interruption === 'warnings removed') {
          view.rerender(<Warning hasWarnings={false} />);
        } else {
          view.unmount();
        }
      });
      expect(overlays()).toHaveLength(0);
      expect(restore.style.opacity).toBe('');
      expect(
        motions.every((motion) => motion.cancel.mock.calls.length === 1)
      ).toBe(true);
    }
  );

  it('uses immediate state and focus changes under reduced motion', () => {
    preference.matches = true;
    render(<Warning />);
    const minimize = screen.getByRole('button', { name: 'Minimize' });
    minimize.focus();
    fireEvent.click(minimize);
    expect(screen.getByRole('button', { name: 'Restore' })).toHaveFocus();
    expect(screen.getByText('Settled')).toBeInTheDocument();
    expect(motions).toHaveLength(0);
    expect(overlays()).toHaveLength(0);
  });
});
