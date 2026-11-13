import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

const fadeDuration = 80;
const foldDuration = 300;
const easing = 'cubic-bezier(.22,.8,.26,1)';
const trailingEasing = 'cubic-bezier(.65,0,.9,.35)';

/** Keeps the warning surface and its icon together while folding to the title badge. */
export function useFundingSummaryMotion(hasWarnings: boolean) {
  const [minimized, setMinimized] = useState(false);
  const [animating, setAnimating] = useState(false);
  const mounted = useRef(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLElement>(null);
  const minimizeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLButtonElement>(null);
  const activeCleanup = useRef<(() => void) | null>(null);

  useEffect(() => {
    mounted.current = true;
    const settle = () => activeCleanup.current?.();
    const reducedMotion = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)'
    );
    window.addEventListener('resize', settle);
    reducedMotion?.addEventListener('change', settle);
    return () => {
      mounted.current = false;
      window.removeEventListener('resize', settle);
      reducedMotion?.removeEventListener('change', settle);
      settle();
    };
  }, []);
  useEffect(() => () => activeCleanup.current?.(), [hasWarnings]);

  function toggle() {
    // A rapid reversal starts from the settled layout, never from a stale overlay.
    activeCleanup.current?.();
    const container = containerRef.current;
    const content = contentRef.current;
    const notice = noticeRef.current;
    const opener = minimized ? restoreRef.current : minimizeRef.current;
    const from = minimized ? restoreRef.current : notice;
    const minimizing = !minimized;
    const transferFocus = document.activeElement === opener;
    const reduced = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    const canAnimate =
      !reduced &&
      container &&
      content &&
      notice &&
      from &&
      typeof from.animate === 'function';
    const fromRect = canAnimate ? from.getBoundingClientRect() : null;
    const beforeContent = canAnimate ? content.getBoundingClientRect() : null;
    const fromIcon = canAnimate ? from.querySelector('svg') : null;
    const fromIconRect = fromIcon?.getBoundingClientRect();
    const copy = canAnimate ? (notice.cloneNode(true) as HTMLElement) : null;
    const surfaceStyle = canAnimate ? getComputedStyle(from) : null;
    // Read computed values before hiding the source node changes its layout.
    const surfaceColors = surfaceStyle
      ? {
          backgroundColor: surfaceStyle.backgroundColor,
          borderColor: surfaceStyle.borderColor,
          color: surfaceStyle.color,
        }
      : null;

    flushSync(() => {
      setMinimized(minimizing);
      setAnimating(Boolean(canAnimate && fromRect?.width));
    });
    const destination = minimizing ? restoreRef.current : noticeRef.current;
    const focusTarget = minimizing ? restoreRef.current : minimizeRef.current;
    if (transferFocus) {
      focusTarget?.focus({ preventScroll: true });
    }
    if (
      !canAnimate ||
      !fromRect?.width ||
      !beforeContent ||
      !copy ||
      !surfaceColors ||
      !destination
    ) {
      setAnimating(false);
      return;
    }

    const toRect = destination.getBoundingClientRect();
    if (!toRect.width) {
      setAnimating(false);
      return;
    }
    const toIconRect = destination
      .querySelector('svg')
      ?.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const afterContent = content.getBoundingClientRect();
    const expandedRect = minimizing ? fromRect : toRect;
    const surface = document.createElement('div');
    const animations: Animation[] = [];
    const animate = (
      element: Element,
      keyframes: Keyframe[],
      options: KeyframeAnimationOptions
    ) => {
      animations.push(element.animate(keyframes, options));
    };
    const oldOpacity = destination.style.opacity;
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      for (const animation of animations) {
        animation.cancel();
      }
      surface.remove();
      copy.remove();
      destination.style.opacity = oldOpacity;
      if (mounted.current) {
        setAnimating(false);
      }
      if (activeCleanup.current === cleanup) {
        activeCleanup.current = null;
      }
    };
    activeCleanup.current = cleanup;

    const position = (rect: DOMRect) => ({
      height: `${rect.height}px`,
      left: `${rect.left - containerRect.left}px`,
      top: `${rect.top - containerRect.top}px`,
      width: `${rect.width}px`,
    });
    const prepareOverlay = (element: HTMLElement) => {
      element.setAttribute('aria-hidden', 'true');
      element.inert = true;
      element.dataset.fundingSummaryMotion = '';
      Object.assign(element.style, {
        boxSizing: 'border-box',
        margin: '0',
        pointerEvents: 'none',
        position: 'absolute',
        zIndex: '10',
      });
    };

    try {
      prepareOverlay(surface);
      Object.assign(surface.style, surfaceColors, position(fromRect), {
        borderRadius: minimizing ? '8px' : '6px',
        borderStyle: 'solid',
        borderWidth: '1px',
        overflow: 'hidden',
      });
      // Only the surface owns a moving icon. The fixed-size copy contains fading text.
      const icon = fromIcon?.cloneNode(true) as SVGElement | undefined;
      if (icon && fromIconRect && toIconRect) {
        Object.assign(icon.style, {
          height: '20px',
          margin: '0',
          position: 'absolute',
          width: '20px',
        });
        surface.append(icon);
        animate(
          icon,
          [
            {
              left: `${fromIconRect.left - fromRect.left}px`,
              top: `${fromIconRect.top - fromRect.top}px`,
            },
            {
              left: `${toIconRect.left - toRect.left}px`,
              top: `${toIconRect.top - toRect.top}px`,
            },
          ],
          {
            delay: minimizing ? fadeDuration : 0,
            duration: foldDuration,
            easing: minimizing ? easing : trailingEasing,
            fill: 'both',
          }
        );
      }
      prepareOverlay(copy);
      copy.removeAttribute('id');
      for (const element of copy.querySelectorAll('[id], [aria-controls]')) {
        element.removeAttribute('id');
        element.removeAttribute('aria-controls');
      }
      const copiedIcon = copy.querySelector<SVGElement>(
        '[data-funding-summary-icon]'
      );
      if (copiedIcon) {
        copiedIcon.style.visibility = 'hidden';
      }
      Object.assign(copy.style, position(expandedRect), {
        background: 'transparent',
        borderColor: 'transparent',
      });
      container.append(surface, copy);
      destination.style.opacity = '0';

      animate(
        surface,
        [
          { ...position(fromRect), borderRadius: minimizing ? '8px' : '6px' },
          { ...position(toRect), borderRadius: minimizing ? '6px' : '8px' },
        ],
        {
          delay: minimizing ? fadeDuration : 0,
          duration: foldDuration,
          easing: minimizing ? easing : trailingEasing,
          fill: 'both',
        }
      );
      animate(
        copy,
        minimizing
          ? [{ opacity: 1 }, { opacity: 0 }]
          : [{ opacity: 0 }, { opacity: 1 }],
        {
          delay: minimizing ? 0 : foldDuration,
          duration: fadeDuration,
          fill: 'both',
        }
      );
      animate(
        content,
        [
          {
            transform: `translateY(${beforeContent.top - afterContent.top}px)`,
          },
          { transform: 'translateY(0)' },
        ],
        {
          delay: minimizing ? fadeDuration : 0,
          duration: foldDuration,
          easing: minimizing ? trailingEasing : easing,
          fill: 'both',
        }
      );
      // Cancelled animations reject finished; both paths must restore the real controls.
      void Promise.all(animations.map((animation) => animation.finished)).then(
        cleanup,
        cleanup
      );
    } catch {
      cleanup();
    }
  }

  return {
    animating,
    containerRef,
    contentRef,
    minimized,
    minimizeRef,
    noticeRef,
    restoreRef,
    toggle,
  };
}
