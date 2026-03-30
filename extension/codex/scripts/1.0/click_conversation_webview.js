/**
 * Click the first conversation item to navigate into a chat
 */
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
    const isVisible = (el) => !!el && el.offsetWidth > 0 && el.offsetHeight > 0 && !el.closest('[inert]');
    const clickElement = (el) => {
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
    };

    const getText = (el) => ((el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '')).trim().replace(/\s+/g, ' ');

    const candidates = Array.from(doc.querySelectorAll('[data-content-search-turn-key], [data-thread-find-target="conversation"] [role="button"], div[class*="cursor-interaction"], [role="button"], button'))
      .filter(isVisible)
      .map((el) => ({
        el,
        text: getText(el),
        className: typeof el.className === 'string' ? el.className : '',
        top: el.getBoundingClientRect().top,
      }))
      .filter(({ text, className }) => {
        if (!text || text.length < 3) return false;
        if (/^view all/i.test(text)) return false;
        if (/^new chat$/i.test(text)) return false;
        if (/^no tasks in progress$/i.test(text)) return false;
        if (/^(codex|tasks?)$/i.test(text)) return false;
        if (/^(local|remote|default permissions|full access|read only|write enabled)$/i.test(text)) return false;
        return className.includes('cursor-interaction') || /\d+[mhds]$/i.test(text) || /\b(today|yesterday)\b/i.test(text);
      })
      .sort((a, b) => a.top - b.top);

    if (candidates.length > 0) {
      clickElement(candidates[0].el);
      return JSON.stringify({ clicked: true, text: candidates[0].text.substring(0, 100) });
    }

    const buttons = Array.from(doc.querySelectorAll('button[aria-label], [role="button"], button')).filter(isVisible);
    const first = buttons.find((button) => {
      const text = getText(button);
      if (!/conversation|recent|chat|session/i.test(text)) return false;
      if (/no tasks in progress|new chat|local|default permissions|full access|read only|write enabled|add files/i.test(text)) return false;
      return true;
    });
    if (first) {
      clickElement(first);
      return JSON.stringify({ clicked: true, text: ((first.textContent || '') || (first.getAttribute('aria-label') || '')).trim().substring(0, 100), fallback: true });
    }

    return JSON.stringify({ clicked: false, error: 'no conversation items found' });
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
})()
