/**
 * Claude Code — open_panel (Cline과 동일 계약: visible / panel_hidden)
 */
(() => {
  try {
    function resolveDoc() {
      for (const iframe of document.querySelectorAll('iframe')) {
        try {
          const d = iframe.contentDocument || iframe.contentWindow?.document;
          if (d?.body) return d;
        } catch (e) {}
      }
      return document;
    }

    const doc = resolveDoc();
    const root = doc.getElementById('root') || doc.body;
    if (root && root.offsetHeight > 0) return 'visible';
    return 'panel_hidden';
  } catch (e) {
    return 'error: ' + e.message;
  }
})();
