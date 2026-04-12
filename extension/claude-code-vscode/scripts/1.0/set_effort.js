;(async () => {
  try {
    const target = String(${ VALUE } || '').trim().toLowerCase();
    const order = ['low', 'medium', 'high', 'max'];
    if (!order.includes(target)) {
      return JSON.stringify({ success: false, error: `invalid effort: ${target}` });
    }

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

    footerButton.click();
    await new Promise((resolve) => setTimeout(resolve, 250));

    const effortButton = Array.from(document.querySelectorAll('button.effortRow_8RAulQ, button[class*="effortRow"]'))
      .find(visible);
    if (!effortButton) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return JSON.stringify({ success: false, error: 'effort button not found' });
    }

    const readEffort = () => {
      const label = normalize(effortButton.textContent || '');
      const match = label.match(/(low|medium|high|max)/i);
      return match ? match[1].toLowerCase() : '';
    };

    let current = readEffort();
    if (!current) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return JSON.stringify({ success: false, error: 'current effort unreadable' });
    }
    if (current === target) {
      getCache().effort = current;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return JSON.stringify({ success: true, effort: current, changed: false });
    }

    for (let i = 0; i < order.length; i += 1) {
      effortButton.click();
      await new Promise((resolve) => setTimeout(resolve, 120));
      current = readEffort();
      if (current === target) {
        getCache().effort = current;
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return JSON.stringify({ success: true, effort: current, changed: true });
      }
    }

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return JSON.stringify({ success: false, error: `failed to reach effort: ${target}`, current });
  } catch (e) {
    return JSON.stringify({ success: false, error: e.message || String(e) });
  }
})()
