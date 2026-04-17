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
    const currentShellTarget = requested === 'plan mode' ? 'Planning' : requestedRaw;

    const findCurrentShellModeButton = () => {
      const ariaButton = doc.querySelector('button[aria-label^="Select conversation mode"]');
      if (ariaButton && ariaButton.offsetWidth > 0) return ariaButton;
      return Array.from(doc.querySelectorAll('button')).find((button) => {
        const cls = String(button.className || '');
        const text = normalize(button.textContent || '');
        return cls.includes('py-1')
          && cls.includes('pl-1')
          && cls.includes('pr-2')
          && cls.includes('opacity-70')
          && button.offsetWidth > 0
          && (text === 'Fast' || text === 'Planning' || text === 'Normal');
      }) || null;
    };

    const clickCurrentShellMode = (targetName) => {
      const headers = Array.from(doc.querySelectorAll('.text-xs.px-2.pb-1.opacity-80'));
      for (const header of headers) {
        if (normalize(header.textContent || '') !== 'Conversation mode') continue;
        const panel = header.parentElement;
        if (!panel) continue;
        for (const item of panel.querySelectorAll('.font-medium')) {
          const text = normalize(item.textContent || '');
          if (text && text.toLowerCase() === targetName.toLowerCase()) {
            item.click();
            return text;
          }
        }
        break;
      }
      return null;
    };

    const currentShellModeButton = findCurrentShellModeButton();
    const currentShellMode = normalize(
      currentShellModeButton?.textContent
      || currentShellModeButton?.getAttribute?.('aria-label')?.replace(/^Select conversation mode, current:\s*/i, '')
      || ''
    );
    if (currentShellModeButton) {
      if (currentShellMode && currentShellMode.toLowerCase() === currentShellTarget.toLowerCase()) {
        return JSON.stringify({ ok: true, mode: currentShellMode, currentValue: currentShellMode, changed: false });
      }
      const direct = clickCurrentShellMode(currentShellTarget);
      if (direct) {
        await sleep(300);
        return JSON.stringify({ ok: true, mode: direct, currentValue: direct, changed: true });
      }
      currentShellModeButton.click();
      await sleep(350);
      const hit = clickCurrentShellMode(currentShellTarget);
      if (hit) {
        await sleep(250);
        return JSON.stringify({ ok: true, mode: hit, currentValue: hit, changed: true });
      }
    }

    const legacyTarget = requested;
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
    if (!footerButton) return JSON.stringify({ ok: false, error: `mode not supported on the current Claude Code surface: ${requestedRaw}` });

    const current = normalize(footerButton.textContent || '');
    if (current.toLowerCase() === legacyTarget) {
      getCache().mode = current;
      return JSON.stringify({ ok: true, mode: current, currentValue: current, changed: false });
    }

    footerButton.click();
    await sleep(250);

    const items = Array.from(doc.querySelectorAll('button.menuItemV2_8RAulQ, [class*="menuItemV2"]'))
      .filter(visible)
      .map((el) => ({
        el,
        label: normalize(el.querySelector('.menuItemLabel_8RAulQ, [class*="menuItemLabel"]')?.textContent || el.textContent || ''),
      }));

    const match = items.find((item) => item.label.toLowerCase() === legacyTarget)
      || items.find((item) => item.label.toLowerCase().includes(legacyTarget) || legacyTarget.includes(item.label.toLowerCase()));
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
})()
