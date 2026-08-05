import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useExpandableOverlay } from '@/shared/hooks/useExpandableOverlay.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function OverlayHarness({ initiallyExpanded = false }) {
  const {
    closeExpanded,
    containerRef,
    isOverlayActive,
    placeholderHeight,
    placeholderRef,
  } = useExpandableOverlay({ enabled: true, initiallyExpanded });

  return (
    <>
      {isOverlayActive ? (
        <div
          data-testid="placeholder"
          ref={placeholderRef}
          style={{ height: placeholderHeight ?? undefined }}
        />
      ) : null}
      <div ref={containerRef}>
        <output data-testid="overlay-state">
          {isOverlayActive ? 'active' : 'inline'}
        </output>
        <output data-testid="placeholder-height">
          {placeholderHeight ?? 'none'}
        </output>
        <button onClick={closeExpanded} type="button">
          Close
        </button>
      </div>
    </>
  );
}

describe('useExpandableOverlay', () => {
  it('preserves inline height for an initially expanded overlay', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(
      120
    );
    vi.spyOn(
      HTMLElement.prototype,
      'getBoundingClientRect'
    ).mockImplementation(function () {
      const height = Number.parseFloat((this as HTMLElement).style.height);

      return {
        bottom: 20 + height,
        height,
        left: 20,
        right: 220,
        toJSON: () => ({}),
        top: 20,
        width: 200,
        x: 20,
        y: 20,
      };
    });

    render(<OverlayHarness initiallyExpanded={true} />);

    expect(screen.getByTestId('placeholder-height')).toHaveTextContent('120');
    expect(screen.getByTestId('placeholder')).toHaveStyle({ height: '120px' });

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.getByTestId('overlay-state')).toHaveTextContent('active');
  });

  it('leaves overlays inline when not initially expanded', () => {
    render(<OverlayHarness />);

    expect(screen.getByTestId('overlay-state')).toHaveTextContent('inline');
    expect(screen.queryByTestId('placeholder')).not.toBeInTheDocument();
  });
});
