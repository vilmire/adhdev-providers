;(async () => {
  try {
    const frame = document.getElementById('active-frame');
    const doc = frame?.contentDocument || frame?.contentWindow?.document || document;
    const view = doc.defaultView || window;
    const requestedRaw = String(${ MODEL } || '').trim();
    const requested = requestedRaw.toLowerCase();
    if (!requested) return JSON.stringify({ ok: false, error: 'model required' });

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

    const aliases = {
      default: ['Default (recommended)', 'Default', 'Sonnet'],
      sonnet: ['Default (recommended)', 'Default', 'Sonnet'],
      'claude-sonnet-4-6': ['Default (recommended)', 'Default', 'Sonnet'],
      opus: ['Opus'],
      'claude-opus-4': ['Opus'],
      'claude-opus-4-6': ['Opus'],
      haiku: ['Haiku'],
      'claude-haiku-3-5': ['Haiku'],
      'claude-haiku-4-5': ['Haiku'],
    };
    const requestedCandidates = Array.from(new Set([
      requestedRaw,
      ...(aliases[requested] || []),
    ].map((value) => normalize(value)).filter(Boolean)));

    const input = doc.querySelector('[role="textbox"].messageInput_cKsPxg');
    const menuButton = doc.querySelector('button.menuButton_gGYT1w');
    let openedViaInput = false;

    const clearInput = () => {
      if (!input) return;
      input.textContent = '';
      input.dispatchEvent(new view.InputEvent('input', {
        bubbles: true,
        inputType: 'deleteContentBackward',
        data: null,
      }));
      input.dispatchEvent(new view.Event('change', { bubbles: true }));
    };

    const openCommandMenu = async () => {
      if (doc.querySelector('.menuPopup_G_S7FQ')) return true;
      if (menuButton && visible(menuButton)) {
        menuButton.click();
        for (let i = 0; i < 8; i += 1) {
          await sleep(100);
          if (doc.querySelector('.menuPopup_G_S7FQ')) return true;
        }
      }
      if (!input || !visible(input)) return false;
      openedViaInput = true;
      input.focus();
      input.textContent = '/';
      input.dispatchEvent(new view.InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: '/',
      }));
      input.dispatchEvent(new view.InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: '/',
      }));
      input.dispatchEvent(new view.Event('change', { bubbles: true }));
      for (let i = 0; i < 8; i += 1) {
        await sleep(100);
        if (doc.querySelector('.menuPopup_G_S7FQ')) return true;
      }
      return false;
    };

    const opened = await openCommandMenu();
    if (!opened) {
      return JSON.stringify({ ok: false, error: `model not supported on the current Claude Code surface: ${requestedRaw}` });
    }

    const switchItem = Array.from(doc.querySelectorAll('.commandItem_G_S7FQ, [class*="commandItem"]'))
      .filter(visible)
      .find((el) => {
        const text = normalize(el.textContent || el.getAttribute('aria-label') || '');
        const title = normalize(el.getAttribute('title') || '');
        return /switch model/i.test(text) || /change the ai model/i.test(title);
      });
    if (!switchItem) {
      doc.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      if (openedViaInput) clearInput();
      return JSON.stringify({ ok: false, error: 'switch model item not found' });
    }

    switchItem.click();
    await sleep(250);

    const items = Array.from(doc.querySelectorAll('.modelItem_G8AMvA, [class*="modelItem"]'))
      .filter(visible)
      .map((el) => {
        const label = normalize(
          el.querySelector('.modelLabel_G8AMvA, [class*="modelLabel"]')?.textContent
          || el.textContent
          || ''
        );
        const className = normalize(el.className || '');
        const active = /activeModelItem|selected|checked/i.test(className)
          || el.getAttribute('aria-checked') === 'true'
          || el.getAttribute('aria-selected') === 'true';
        return label ? { el, label, active } : null;
      })
      .filter(Boolean);

    const currentItem = items.find((item) => item.active) || null;
    const currentLabel = currentItem?.label || normalize(getCache().modelLabel || getCache().model || '');
    const alreadySelected = currentLabel && requestedCandidates.some((candidate) => {
      const labelLower = currentLabel.toLowerCase();
      const candidateLower = candidate.toLowerCase();
      return labelLower === candidateLower || labelLower.includes(candidateLower) || candidateLower.includes(labelLower);
    });
    if (alreadySelected) {
      doc.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      if (openedViaInput) clearInput();
      getCache().model = currentLabel;
      getCache().modelLabel = currentLabel;
      return JSON.stringify({ ok: true, model: currentLabel, currentValue: currentLabel, changed: false, method: 'command-menu' });
    }

    const match = items.find((item) => requestedCandidates.some((candidate) => {
      const labelLower = item.label.toLowerCase();
      const candidateLower = candidate.toLowerCase();
      return labelLower === candidateLower || labelLower.includes(candidateLower) || candidateLower.includes(labelLower);
    }));
    if (!match) {
      doc.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      if (openedViaInput) clearInput();
      return JSON.stringify({ ok: false, error: `model option not found: ${requestedRaw}`, available: items.map((item) => item.label) });
    }

    match.el.click();
    await sleep(250);
    doc.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    if (openedViaInput) clearInput();

    getCache().model = match.label;
    getCache().modelLabel = match.label;

    return JSON.stringify({
      ok: true,
      model: match.label,
      currentValue: match.label,
      changed: true,
      method: 'command-menu',
    });
  } catch (e) {
    return JSON.stringify({ ok: false, error: e.message || String(e) });
  }
})();
