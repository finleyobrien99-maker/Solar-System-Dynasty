// Bridge to the Expo phone app (see mobile/). In a normal browser every call
// here is a no-op, so the web build behaves exactly as before.

type Haptic = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

type Outgoing =
  | { type: 'haptic'; kind: Haptic }
  | { type: 'store'; key: string; value: string | null }
  | { type: 'share'; filename: string; text: string }
  | { type: 'exit' };

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage(msg: string): void };
    /** Saves the app kept on the phone, injected before the page loads. */
    __NATIVE_STORE__?: Record<string, string>;
    __onNativeBack?: () => void;
  }
}

// The app writes __NATIVE_STORE__ into the page itself, so it is there even
// if the WebView's own bridge object turns up a moment later.
export const inApp = typeof window !== 'undefined' && (!!window.ReactNativeWebView || !!window.__NATIVE_STORE__);

function post(msg: Outgoing): void {
  try {
    window.ReactNativeWebView?.postMessage(JSON.stringify(msg));
  } catch {
    // The shell went away; nothing useful to do.
  }
}

export function haptic(kind: Haptic = 'light'): void {
  if (inApp) post({ type: 'haptic', kind });
}

/** Mirror a storage key into the phone's own storage, which outlives the WebView's. */
export function mirror(key: string, value: string | null): void {
  if (inApp) post({ type: 'store', key, value });
}

/** Hand a file to the phone's share sheet. Returns false outside the app. */
export function shareFile(filename: string, text: string): boolean {
  if (!inApp) return false;
  post({ type: 'share', filename, text });
  return true;
}

/**
 * Call once at startup. Puts back any save the WebView lost (iOS may clear
 * web storage for apps it thinks are idle), and wires up the hardware back
 * button on Android.
 */
export function initNative(): void {
  if (!inApp) return;
  document.documentElement.classList.add('in-app');
  const kept = window.__NATIVE_STORE__ ?? {};
  for (const [k, v] of Object.entries(kept)) {
    try {
      if (localStorage.getItem(k) === null) localStorage.setItem(k, v);
    } catch {
      // Storage full or blocked: the save stays safe on the native side.
    }
  }
  window.__onNativeBack = handleBack;
}

/** Back closes whatever is on top: a tooltip, a modal, a setup step. Otherwise the app exits. */
function handleBack(): void {
  if (document.querySelector('.tip')) {
    // Tips close on any press outside them.
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    return;
  }
  const overlays = document.querySelectorAll('.overlay');
  const top = overlays[overlays.length - 1];
  if (top) {
    // Each window's close callback pops the typed UI stack, revealing its parent.
    top.querySelector<HTMLButtonElement>('.close-x')?.click();
    return; // events must be answered, so back does nothing there
  }
  // The innermost step's back button comes last in the page.
  const backs = document.querySelectorAll<HTMLButtonElement>('[data-back]');
  const back = backs[backs.length - 1];
  if (back) {
    back.click();
    return;
  }
  post({ type: 'exit' });
}
