export interface SwipeOptions {
  onNext: () => void;
  onPrev: () => void;
  onTap?: (fraction: number) => void;
  /** return true to ignore the gesture (e.g. text is being selected) */
  isBlocked?: () => boolean;
}

/**
 * Horizontal touch swipe -> previous/next page. Attached to the scrolling
 * container or, for EPUB, to the iframe document (touch events inside an
 * iframe never reach the parent page).
 */
export function attachSwipe(target: EventTarget, options: SwipeOptions): () => void {
  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let tracking = false;
  let longPress = false;
  let longPressTimer: ReturnType<typeof setTimeout> | undefined;

  const clearLongPress = () => {
    if (longPressTimer) clearTimeout(longPressTimer);
    longPressTimer = undefined;
  };

  const onStart = (event: Event) => {
    const touchEvent = event as TouchEvent;
    if (touchEvent.touches.length !== 1) {
      tracking = false;
      return;
    }
    if (options.isBlocked?.()) {
      tracking = false;
      return;
    }
    const touch = touchEvent.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    startTime = Date.now();
    longPress = false;
    clearLongPress();
    longPressTimer = setTimeout(() => {
      longPress = true;
    }, 500);
    tracking = true;
  };

  const onMove = (event: Event) => {
    if (!tracking) return;
    const touch = (event as TouchEvent).touches[0];
    if (!touch) return;
    if (Math.abs(touch.clientX - startX) > 12 || Math.abs(touch.clientY - startY) > 12) {
      clearLongPress();
    }
  };

  const onEnd = (event: Event) => {
    if (!tracking) return;
    tracking = false;
    clearLongPress();
    const touchEvent = event as TouchEvent;
    const touch = touchEvent.changedTouches[0];
    if (!touch) return;
    // Long-press (text selection) or an active selection never turns pages.
    if (longPress || options.isBlocked?.()) return;
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    const duration = Date.now() - startTime;
    if (duration > 1000) return;
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      const screenWidth = window.screen.width || window.innerWidth || 1;
      const screenX = touch.screenX || touch.clientX;
      options.onTap?.(screenX / screenWidth);
      return;
    }
    if (Math.abs(dx) < 55) return;
    if (Math.abs(dy) > 50) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.3) return;
    if (dx < 0) options.onNext();
    else options.onPrev();
  };

  const onCancel = () => {
    tracking = false;
    clearLongPress();
  };

  target.addEventListener('touchstart', onStart, { passive: true });
  target.addEventListener('touchmove', onMove, { passive: true });
  target.addEventListener('touchend', onEnd, { passive: true });
  target.addEventListener('touchcancel', onCancel, { passive: true });

  return () => {
    clearLongPress();
    target.removeEventListener('touchstart', onStart);
    target.removeEventListener('touchmove', onMove);
    target.removeEventListener('touchend', onEnd);
    target.removeEventListener('touchcancel', onCancel);
  };
}
