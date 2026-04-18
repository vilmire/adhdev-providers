(() => {
  try {
    const resolveDoc = () => {
      if (document.getElementById('root')) return document;
      for (const iframe of document.querySelectorAll('iframe')) {
        try {
          const innerDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (innerDoc?.getElementById('root')) return innerDoc;
        } catch (e) {}
      }
      return document;
    };

    const doc = resolveDoc();
    const view = doc.defaultView || window;
    const visible = (el) => {
      if (!el || el.closest('[inert]')) return false;
      const rect = el.getBoundingClientRect();
      const style = (el.ownerDocument?.defaultView || view).getComputedStyle(el);
      return rect.width > 8 && rect.height > 8 && style.display !== 'none' && style.visibility !== 'hidden';
    };

    const hasVisibleSessionRows = () => Array.from(doc.querySelectorAll('div[role="button"], [role="button"], div, li, a'))
      .filter((el) => visible(el))
      .some((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.top < 24 || rect.top > 220 || rect.height < 20 || rect.height > 56) return false;
        return !!el.querySelector('.tabular-nums, [class*="tabular-nums"], [class*="text-right"]');
      });

    const root = doc.getElementById('root') || doc.body;
    const hasVisibleUi = [
      root,
      doc.querySelector('.ProseMirror[contenteditable="true"]'),
      doc.querySelector('.ProseMirror'),
      ...Array.from(doc.querySelectorAll('[data-content-search-turn-key], [data-content-search-unit-key], button, [role="button"], [role="textbox"], input, textarea')),
    ].some((el) => visible(el));

    if (hasVisibleUi || hasVisibleSessionRows()) return 'visible';
    return 'panel_hidden';
  } catch (e) {
    return 'error: ' + (e.message || String(e));
  }
})();
