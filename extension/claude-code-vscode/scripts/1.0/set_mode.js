;(async () => {
  try {
    const target = String(${ MODE } || '').trim().toLowerCase();
    if (!target) return JSON.stringify({ success: false, error: 'mode required' });

    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = (el) => {
      if (!el || el.closest('[inert]')) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 8 && rect.height > 8 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const getCache = () => {
      if (!window.__adhdevClaudeCodeControls || typeof window.__adhdevClaudeCodeControls !== 'object') {
        window.__adhdevClaudeCodeControls = {};
      }
      return window.__adhdevClaudeCodeControls;
    };
    const footerButton = document.querySelector('button.footerButton_gGYT1w.footerButtonPrimary_gGYT1w');
    if (!footerButton) return JSON.stringify({ success: false, error: 'mode button not found' });

    const current = normalize(footerButton.textContent || '');
    if (current.toLowerCase() === target) {
      getCache().mode = current;
      return JSON.stringify({ success: true, mode: current, changed: false });
    }

    footerButton.click();
    await new Promise((resolve) => setTimeout(resolve, 250));

    const items = Array.from(document.querySelectorAll('button.menuItemV2_8RAulQ, [class*="menuItemV2"]'))
      .filter(visible)
      .map((el) => ({
        el,
        label: normalize(el.querySelector('.menuItemLabel_8RAulQ, [class*="menuItemLabel"]')?.textContent || el.textContent || ''),
      }));

    const match = items.find((item) => item.label.toLowerCase() === target)
      || items.find((item) => item.label.toLowerCase().includes(target) || target.includes(item.label.toLowerCase()));
    if (!match) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return JSON.stringify({ success: false, error: `mode not found: ${target}`, available: items.map((item) => item.label) });
    }

    match.el.click();
    await new Promise((resolve) => setTimeout(resolve, 200));
    getCache().mode = match.label;
    return JSON.stringify({ success: true, mode: match.label, changed: true });
  } catch (e) {
    return JSON.stringify({ success: false, error: e.message || String(e) });
  }
})()
