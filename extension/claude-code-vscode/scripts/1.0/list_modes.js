;(async () => {
  try {
    const frame = document.getElementById('active-frame');
    const doc = frame?.contentDocument || frame?.contentWindow?.document || document;
    const view = doc.defaultView || window;

    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = (el) => {
      if (!el || el.closest('[inert]')) return false;
      const rect = el.getBoundingClientRect();
      const style = (el.ownerDocument?.defaultView || view).getComputedStyle(el);
      return rect.width > 8 && rect.height > 8 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const dedupe = (values) => Array.from(new Set(values.filter(Boolean)));
    const getCache = () => {
      if (!window.__adhdevClaudeCodeControls || typeof window.__adhdevClaudeCodeControls !== 'object') {
        window.__adhdevClaudeCodeControls = {};
      }
      return window.__adhdevClaudeCodeControls;
    };

    const footerButton = doc.querySelector('button.footerButton_gGYT1w.footerButtonPrimary_gGYT1w');
    if (!footerButton || !visible(footerButton)) {
      return JSON.stringify({ options: [], currentValue: '', error: 'mode selector not found' });
    }

    const currentValue = normalize(footerButton.textContent || footerButton.getAttribute?.('aria-label') || '');
    if (currentValue) getCache().mode = currentValue;

    footerButton.click();
    await sleep(250);

    const options = dedupe(
      Array.from(doc.querySelectorAll('button.menuItemV2_8RAulQ, [class*="menuItemV2"]'))
        .filter(visible)
        .map((item) => normalize(
          item.querySelector('.menuItemLabel_8RAulQ, [class*="menuItemLabel"]')?.textContent
          || item.textContent
          || ''
        ))
    ).map((label) => ({ value: label, label }));

    doc.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    if (options.length > 0 || currentValue) {
      return JSON.stringify({ options, currentValue });
    }

    return JSON.stringify({ options: [], currentValue: '', error: 'mode selector not found' });
  } catch (e) {
    return JSON.stringify({ options: [], currentValue: '', error: e.message || String(e) });
  }
})();
