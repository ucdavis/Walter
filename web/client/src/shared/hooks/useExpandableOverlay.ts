import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
  type TransitionEvent,
} from 'react';
import { useLockBodyScroll } from '@/shared/hooks/useLockBodyScroll.ts';

type OverlayRect = { height: number; left: number; top: number; width: number };
type ExpandPhase = 'inline' | 'opening' | 'expanded' | 'closing';

const DEFAULT_MARGIN_PX = 16;

// Maps a DOMRect into a plain object we can store in state.
function rectFromDomRect(rect: DOMRect): OverlayRect {
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}

// Ensures a measured rect can be used for an animation transition.
function isUsableRect(rect: OverlayRect): boolean {
  return (
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

// Computes the target overlay size anchored to the viewport.
function getExpandedRect(marginPx: number): OverlayRect {
  return {
    height: Math.max(0, window.innerHeight - 2 * marginPx),
    left: marginPx,
    top: marginPx,
    width: Math.max(0, window.innerWidth - 2 * marginPx),
  };
}

// Reads the user's reduced-motion preference from the browser.
function prefersReducedMotionEnabled(): boolean {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return false;
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface UseExpandableOverlayOptions {
  enabled: boolean;
  marginPx?: number;
}

interface UseExpandableOverlayResult {
  canAnimateRect: boolean;
  closeExpanded: () => void;
  containerRef: RefObject<HTMLDivElement | null>;
  expandButtonRef: RefObject<HTMLButtonElement | null>;
  handleContainerTransitionEnd: (
    e: TransitionEvent<HTMLDivElement>
  ) => void;
  isOverlayActive: boolean;
  overlayStyle: CSSProperties | undefined;
  placeholderHeight: number | null;
  placeholderRef: RefObject<HTMLDivElement | null>;
  prefersReducedMotion: boolean;
  toggleExpanded: () => void;
}

// Handles table overlay expansion/collapse state, transitions, and keyboard behavior.
export function useExpandableOverlay({
  enabled,
  marginPx = DEFAULT_MARGIN_PX,
}: UseExpandableOverlayOptions): UseExpandableOverlayResult {
  const prefersReducedMotion = useMemo(() => prefersReducedMotionEnabled(), []);

  const [expandPhase, setExpandPhase] = useState<ExpandPhase>('inline');
  const [overlayRect, setOverlayRect] = useState<OverlayRect | null>(null);
  const [placeholderHeight, setPlaceholderHeight] = useState<number | null>(
    null
  );
  const [canAnimateRect, setCanAnimateRect] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const placeholderRef = useRef<HTMLDivElement | null>(null);
  const expandButtonRef = useRef<HTMLButtonElement | null>(null);
  const frameIdsRef = useRef<number[]>([]);

  const isOverlayActive = expandPhase !== 'inline';
  useLockBodyScroll(isOverlayActive);

  // Stops any queued RAF callbacks so stale animations cannot run.
  const cancelScheduledFrames = useCallback(() => {
    for (const frameId of frameIdsRef.current) {
      window.cancelAnimationFrame(frameId);
    }
    frameIdsRef.current = [];
  }, []);

  // Resets overlay state and restores focus to the expand/collapse trigger.
  const finalizeClose = useCallback(() => {
    setExpandPhase('inline');
    setOverlayRect(null);
    setPlaceholderHeight(null);
    setCanAnimateRect(false);
    expandButtonRef.current?.focus();
  }, []);

  // Expands from inline bounds to viewport bounds.
  const openExpanded = useCallback(() => {
    if (!enabled) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    const fromRect = rectFromDomRect(container.getBoundingClientRect());
    setPlaceholderHeight(container.offsetHeight);

    if (prefersReducedMotion || !isUsableRect(fromRect)) {
      setCanAnimateRect(false);
      setOverlayRect(getExpandedRect(marginPx));
      setExpandPhase('expanded');
      return;
    }

    // Step 1: convert to fixed layout while staying visually in the inline spot.
    setCanAnimateRect(false);
    setOverlayRect(fromRect);
    setExpandPhase('opening');

    // Step 2: enable transitions, then on the next frame move to expanded bounds.
    cancelScheduledFrames();
    const firstFrameId = window.requestAnimationFrame(() => {
      setCanAnimateRect(true);

      const secondFrameId = window.requestAnimationFrame(() => {
        setOverlayRect(getExpandedRect(marginPx));
      });
      frameIdsRef.current.push(secondFrameId);
    });
    frameIdsRef.current.push(firstFrameId);
  }, [cancelScheduledFrames, enabled, marginPx, prefersReducedMotion]);

  // Collapses from viewport bounds back to the placeholder location.
  const closeExpanded = useCallback(() => {
    if (!isOverlayActive) {
      return;
    }

    if (prefersReducedMotion) {
      finalizeClose();
      return;
    }

    const placeholder = placeholderRef.current;
    if (!placeholder) {
      finalizeClose();
      return;
    }

    const toRect = rectFromDomRect(placeholder.getBoundingClientRect());
    if (!isUsableRect(toRect)) {
      finalizeClose();
      return;
    }

    // Transition back to the preserved inline bounds, then finalize on transition end.
    setCanAnimateRect(true);
    setOverlayRect(toRect);
    setExpandPhase('closing');
  }, [finalizeClose, isOverlayActive, prefersReducedMotion]);

  // Public toggle used by the expand/collapse button.
  const toggleExpanded = useCallback(() => {
    if (!enabled) {
      return;
    }

    if (isOverlayActive) {
      closeExpanded();
      return;
    }

    openExpanded();
  }, [closeExpanded, enabled, isOverlayActive, openExpanded]);

  // Finalizes open/close phases when the container transition finishes.
  const handleContainerTransitionEnd = useCallback(
    (e: TransitionEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) {
        return;
      }

      if (expandPhase === 'opening') {
        setExpandPhase('expanded');
        return;
      }

      if (expandPhase === 'closing') {
        finalizeClose();
      }
    },
    [expandPhase, finalizeClose]
  );

  const overlayStyle =
    isOverlayActive && overlayRect
      ? {
          height: overlayRect.height,
          left: overlayRect.left,
          top: overlayRect.top,
          width: overlayRect.width,
        }
      : undefined;

  // Cleanup to avoid running queued animation frames after unmount.
  useEffect(() => {
    return () => {
      if (typeof window === 'undefined') {
        return;
      }
      cancelScheduledFrames();
    };
  }, [cancelScheduledFrames]);

  // Enables Escape-to-close while expanded.
  useEffect(() => {
    if (!isOverlayActive) {
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') {
        return;
      }
      e.preventDefault();
      closeExpanded();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeExpanded, isOverlayActive]);

  // Recomputes overlay bounds when the viewport changes size.
  useEffect(() => {
    if (expandPhase !== 'expanded') {
      return;
    }

    const onResize = () => {
      setOverlayRect(getExpandedRect(marginPx));
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [expandPhase, marginPx]);

  return {
    canAnimateRect,
    closeExpanded,
    containerRef,
    expandButtonRef,
    handleContainerTransitionEnd,
    isOverlayActive,
    overlayStyle,
    placeholderHeight,
    placeholderRef,
    prefersReducedMotion,
    toggleExpanded,
  };
}
