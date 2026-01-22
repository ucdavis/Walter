import '@testing-library/jest-dom/vitest';

if (!('ResizeObserver' in window)) {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).ResizeObserver = ResizeObserver;
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

if (typeof HTMLDialogElement !== 'undefined') {
  if (!('open' in HTMLDialogElement.prototype)) {
    Object.defineProperty(HTMLDialogElement.prototype, 'open', {
      configurable: true,
      get() {
        return this.hasAttribute('open');
      },
      set(value: boolean) {
        if (value) {
          this.setAttribute('open', '');
        } else {
          this.removeAttribute('open');
        }
      },
    });
  }

  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '');
    };
  }

  const nativeClose = HTMLDialogElement.prototype.close;
  HTMLDialogElement.prototype.close = function close() {
    nativeClose?.call(this);
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}
