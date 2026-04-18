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

    const candidates = [
      doc.querySelector('.ProseMirror[contenteditable="true"]'),
      doc.querySelector('.ProseMirror'),
      ...Array.from(doc.querySelectorAll('[role="textbox"], textarea, input')),
    ].filter((el, idx, arr) => !!el && arr.indexOf(el) === idx && visible(el));

    const input = candidates[0];
    if (!input) return 'no input';

    input.focus();
    if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
      const value = typeof input.value === 'string' ? input.value.length : 0;
      input.setSelectionRange?.(value, value);
      return 'focused';
    }

    const selection = view.getSelection();
    const range = doc.createRange();
    range.selectNodeContents(input);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    return 'focused';
  } catch (e) {
    return 'error: ' + (e.message || String(e));
  }
})();
