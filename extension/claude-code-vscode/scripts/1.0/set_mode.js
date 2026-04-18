;(async () => {
  try {
    const frame = document.getElementById('active-frame');
    const doc = frame?.contentDocument || frame?.contentWindow?.document || document;
    const view = doc.defaultView || window;
    const requestedRaw = String(${ MODE } || '').trim();
    const requested = requestedRaw.toLowerCase();
    if (!requested) return JSON.stringify({ ok: false, error: 'mode required' });

    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const visible = (el) => {
      if (!el || el.closest('[inert]')) return false;
      const rect = el.getBoundingClientRect();
      const style = (el.ownerDocument?.defaultView || view).getComputedStyle(el);
      return rect.width > 8 && rect.height > 8 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const getCache = () => {
      if (!window.__adhdevClaudeCodeControls || typeof window.__adhdevClaudeCodeControls !== 'object') {
        window.__adhdevClaudeCodeControls = {};
      }
      return window.__adhdevClaudeCodeControls;
    };

    const footerButton = doc.querySelector('button.footerButton_gGYT1w.footerButtonPrimary_gGYT1w');
    if (!footerButton || !visible(footerButton)) {
      return JSON.stringify({ ok: false, error: `mode not supported on the current Claude Code surface: ${requestedRaw}` });
    }

    const current = normalize(footerButton.textContent || footerButton.getAttribute('aria-label') || '');
    if (current && current.toLowerCase() === requested) {
      getCache().mode = current;
      return JSON.stringify({ ok: true, mode: current, currentValue: current, changed: false });
    }

    footerButton.click();
    await sleep(250);

    const items = Array.from(doc.querySelectorAll('button.menuItemV2_8RAulQ, [class*="menuItemV2"]'))
      .filter(visible)
      .map((el) => ({
        el,
        label: normalize(
          el.querySelector('.menuItemLabel_8RAulQ, [class*="menuItemLabel"]')?.textContent
          || el.textContent
          || ''
        ),
      }))
      .filter((item) => item.label);

    const match = items.find((item) => item.label.toLowerCase() === requested)
      || items.find((item) => item.label.toLowerCase().includes(requested) || requested.includes(item.label.toLowerCase()));
    if (!match) {
      doc.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return JSON.stringify({ ok: false, error: `mode not found: ${requestedRaw}`, available: items.map((item) => item.label) });
    }

    match.el.click();
    await sleep(200);
    getCache().mode = match.label;
    return JSON.stringify({ ok: true, mode: match.label, currentValue: match.label, changed: true });
  } catch (e) {
    return JSON.stringify({ ok: false, error: e.message || String(e) });
  }
})();
