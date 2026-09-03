(() => {
  'use strict';
  if (globalThis.__SIGNALSCOPE_LINK_BRIDGE__) return;
  globalThis.__SIGNALSCOPE_LINK_BRIDGE__ = true;
  window.addEventListener('signalscope-arm-link-capture', () => {
    const clipboard = navigator.clipboard;
    if (!clipboard?.writeText || clipboard.__signalscopeArmed) return;
    const original = clipboard.writeText;
    clipboard.__signalscopeArmed = true;
    let timer;
    const restore = () => {
      clearTimeout(timer);
      try { clipboard.writeText = original; delete clipboard.__signalscopeArmed; } catch {}
    };
    try {
      clipboard.writeText = function (value) {
        const text = String(value || '');
        if (/^https:\/\/(?:www\.)?linkedin\.com\/(?:feed\/update\/urn:li:(?:activity|ugcPost):\d+|posts\/)/i.test(text)) {
          window.postMessage({ source: 'signalscope-page', type: 'captured-post-link', value: text }, location.origin);
          restore();
          return Promise.resolve();
        }
        restore();
        return original.call(clipboard, value);
      };
      timer = setTimeout(restore, 1200);
    } catch { restore(); }
  });
})();
