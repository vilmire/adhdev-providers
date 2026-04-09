/**
 * Codex Extension — Session/History UI explorer
 * Finds visible buttons and clickable rows that may correspond to history/session switching.
 */
(args = {}) => {
  try {
    const resolveDoc = () => {
      if (document.getElementById('root')) return document;
      for (const iframe of document.querySelectorAll('iframe')) {
        try {
          const innerDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (innerDoc?.getElementById('root')) return innerDoc;
        } catch {}
      }
      return document;
    };

    const doc = resolveDoc();
    const root = doc.getElementById('root');
    if (!root) return JSON.stringify({ error: 'no root element' });

    const isVisible = (el) => !!el && el.offsetWidth > 0 && el.offsetHeight > 0 && !el.closest('[inert]');
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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
    const describe = (el) => {
      const rect = el.getBoundingClientRect();
      return {
        tag: el.tagName?.toLowerCase(),
        role: el.getAttribute?.('role') || null,
        ariaLabel: normalize(el.getAttribute?.('aria-label') || ''),
        text: normalize(el.textContent || ''),
        className: typeof el.className === 'string' ? el.className.slice(0, 240) : '',
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };

    const allButtonElements = Array.from(doc.querySelectorAll('button, [role="button"]')).filter(isVisible);
    const action = typeof args === 'string' ? args : args?.action || null;

    let clicked = null;
    if (action) {
      const target = allButtonElements.find((el) => {
        const label = normalize(`${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`).toLowerCase();
        if (action === 'recent') return /recent tasks|task in progress|tasks?/.test(label) && !/new chat/.test(label);
        if (action === 'back') return /\bback\b|go back/.test(label);
        if (action === 'new') return /\bnew chat\b|\bnew conversation\b|\bnew session\b/.test(label);
        return false;
      });
      if (target) {
        clicked = describe(target);
        clickElement(target);
      }
    }

    const collectVisibleButtons = () => Array.from(doc.querySelectorAll('button, [role="button"]'))
      .filter(isVisible)
      .map((el) => describe(el))
      .slice(0, 200);

    return Promise.resolve()
      .then(() => action ? sleep(450) : null)
      .then(() => {
        const visibleButtons = collectVisibleButtons();

        const sessionButtons = visibleButtons.filter((entry) => {
          const text = `${entry.ariaLabel} ${entry.text}`.toLowerCase();
          return /(task|tasks|history|recent|conversation|chat|session|back|new)/.test(text);
        });

        const clickableRows = Array.from(doc.querySelectorAll('div, li, a, button, [role="button"]'))
          .filter(isVisible)
          .filter((el) => {
            const text = normalize(el.textContent || '');
            const role = (el.getAttribute?.('role') || '').toLowerCase();
            const className = typeof el.className === 'string' ? el.className : '';
            if (!text || text.length < 3 || text.length > 220) return false;
            if (/^(new chat|codex|tasks?)$/i.test(text)) return false;
            if (/^(local|remote|default permissions|full access|read only|write enabled)$/i.test(text)) return false;
            if (role === 'button') return true;
            return /cursor-interaction|hover|rounded|truncate|overflow-hidden|group/.test(className);
          })
          .map((el) => describe(el))
          .slice(0, 200);

        const popovers = Array.from(doc.querySelectorAll('[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper], [data-side], [cmdk-root]'))
          .filter(isVisible)
          .map((el) => ({
            ...describe(el),
            childText: normalize(el.textContent || ''),
            items: Array.from(el.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="option"], button, div, li'))
              .filter(isVisible)
              .map((item) => describe(item))
              .filter((item) => item.text || item.ariaLabel)
              .slice(0, 40),
          }))
          .slice(0, 20);

        const header = normalize(doc.querySelector('[style*="view-transition-name: header-title"]')?.textContent || '');

        return JSON.stringify({
          action,
          clicked,
          header,
          sessionButtons,
          visibleButtons,
          clickableRows,
          popovers,
        });
      });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e) });
  }
}
