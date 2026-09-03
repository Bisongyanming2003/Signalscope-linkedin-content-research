(() => {
  'use strict';
  if (globalThis.__SIGNALSCOPE_LINK_BRIDGE__) return;
  globalThis.__SIGNALSCOPE_LINK_BRIDGE__ = true;

  const isPostLink = value => /^https:\/\/(?:www\.)?linkedin\.com\/(?:feed\/update\/urn:li:(?:activity|ugcPost):\d+|posts\/[^\s]+activity-\d+)/i.test(String(value || '').trim());
  const publish = value => {
    const text = String(value || '').trim();
    if (!isPostLink(text)) return false;
    window.postMessage({ source: 'signalscope-page', type: 'captured-post-link', value: text }, location.origin);
    return true;
  };

  window.addEventListener('signalscope-arm-link-capture', () => {
    const clipboard = navigator.clipboard;
    const originalWriteText = clipboard?.writeText;
    const originalWrite = clipboard?.write;
    const originalExecCommand = document.execCommand;
    let armed = true;
    let timer;

    const inspectPageText = () => {
      const selection = String(window.getSelection?.() || '');
      if (publish(selection)) return true;
      const active = document.activeElement;
      if (publish(active?.value)) return true;
      for (const node of document.querySelectorAll('input,textarea')) if (publish(node.value)) return true;
      return false;
    };
    const restore = () => {
      if (!armed) return;
      armed = false;
      clearTimeout(timer);
      try { if (clipboard && originalWriteText) clipboard.writeText = originalWriteText; } catch {}
      try { if (clipboard && originalWrite) clipboard.write = originalWrite; } catch {}
      try { document.execCommand = originalExecCommand; } catch {}
      document.removeEventListener('copy', onCopy, true);
    };
    const succeed = value => { const found = publish(value); if (found) restore(); return found; };
    const onCopy = event => {
      const direct = event.clipboardData?.getData('text/plain') || event.clipboardData?.getData('text/uri-list') || '';
      if (succeed(direct)) { event.preventDefault(); return; }
      queueMicrotask(() => { if (armed && inspectPageText()) restore(); });
    };

    try {
      if (clipboard && originalWriteText) clipboard.writeText = function (value) {
        if (succeed(value)) return Promise.resolve();
        return originalWriteText.call(clipboard, value);
      };
    } catch {}
    try {
      if (clipboard && originalWrite) clipboard.write = async function (items) {
        for (const item of items || []) {
          for (const type of ['text/plain','text/uri-list']) {
            if (!item.types?.includes(type)) continue;
            try { if (succeed(await (await item.getType(type)).text())) return; } catch {}
          }
        }
        return originalWrite.call(clipboard, items);
      };
    } catch {}
    try {
      document.execCommand = function (command, ...args) {
        if (String(command).toLowerCase() === 'copy' && inspectPageText()) { restore(); return true; }
        return originalExecCommand.call(document, command, ...args);
      };
    } catch {}
    document.addEventListener('copy', onCopy, true);
    timer = setTimeout(restore, 1500);
  });
})();
