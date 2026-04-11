/**
 * Claude Code — open_panel (Cline과 동일 계약: visible / panel_hidden)
 */
(() => {
  try {
    function resolveDoc() {
      let doc = document;
      if (doc.getElementById('root')) {
        const inner = doc.querySelector('iframe');
        if (inner) {
          try {
            const d = inner.contentDocument || inner.contentWindow?.document;
            if (d?.getElementById('root')) return d;
          } catch (e) {}
        }
        return doc;
      }
      for (const iframe of doc.querySelectorAll('iframe')) {
        try {
          const innerDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (!innerDoc) continue;
          if (innerDoc.getElementById('root')) return innerDoc;
          for (const inner2 of innerDoc.querySelectorAll('iframe')) {
            try {
              const d2 = inner2.contentDocument || inner2.contentWindow?.document;
              if (d2?.getElementById('root')) return d2;
            } catch (e2) {}
          }
          if (innerDoc.body) return innerDoc;
        } catch (e) {}
      }
      return doc;
    }

    const doc = resolveDoc();
    const root = doc.getElementById('root') || doc.body;
    if (root && root.offsetHeight > 0) return 'visible';
    return 'panel_hidden';
  } catch (e) {
    return 'error: ' + e.message;
  }
})();
