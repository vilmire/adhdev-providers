(() => {
  try {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const isVisible = (el) => {
      if (!el || el.closest('[inert]')) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 8 && rect.height > 8;
    };
    const click = (el) => {
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
      if (typeof el.click === 'function') el.click();
    };

    const buttons = Array.from(document.querySelectorAll('button, [role="button"]')).filter(isVisible);
    const target = buttons.find((button) => {
      const text = normalize(button.textContent || button.getAttribute('aria-label') || '').toLowerCase();
      return text === 'new session' || text.includes('new session');
    });

    if (!target) {
      return JSON.stringify({
        success: false,
        error: 'new session button not found',
        available: buttons.map((button) => normalize(button.textContent || button.getAttribute('aria-label') || '')).filter(Boolean),
      });
    }

    click(target);
    return JSON.stringify({ success: true, action: 'new_session' });
  } catch (e) {
    return JSON.stringify({ success: false, error: e.message || String(e) });
  }
})();
