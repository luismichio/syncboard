const GA_MEASUREMENT_ID = 'G-Q4W94QDWWC';

/**
 * Fire a Google Analytics event if gtag is loaded.
 */
export function trackEvent(action: string, label?: string, value?: number): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') {
    return;
  }

  const payload: {
    event_label?: string;
    value?: number;
    send_to: string;
  } = {
    send_to: GA_MEASUREMENT_ID,
  };

  if (label !== undefined) {
    payload.event_label = label;
  }

  if (typeof value === 'number') {
    payload.value = value;
  }

  window.gtag('event', action, payload);
}
