/**
 * Codex Extension — new_session
 * Clicks the "New chat" / "New chat" button
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
    const buttons = Array.from(doc.querySelectorAll('button, [role="button"]')).filter(isVisible);
    const newChatBtn = buttons.find(b => {
      const label = ((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')).toLowerCase().replace(/\s+/g, ' ').trim();
      if (!label) return false;
      if (/history|recent|conversation|session|archive|task/.test(label)) return false;
      return /\bnew chat\b|\bnew conversation\b|\bnew session\b|\bnew\b/.test(label);
    });

    if (newChatBtn) {
      clickElement(newChatBtn);
      return JSON.stringify({ success: true, action: 'new_session' });
    }

    return JSON.stringify({
      success: false,
      error: 'New chat button not found',
      available: buttons.map(b => ((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')).trim()).filter(Boolean),
    });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e) });
  }
})()
