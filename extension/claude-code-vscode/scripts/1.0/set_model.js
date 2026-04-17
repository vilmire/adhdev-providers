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
    const shellCandidates = (() => {
      const candidates = [requestedRaw];
      if (requested === 'default' || requested === 'sonnet' || requested === 'claude-sonnet-4-6') {
        candidates.push('Claude Sonnet 4.6 (Thinking)', 'Claude Sonnet');
      }
      if (requested === 'opus' || requested === 'claude-opus-4' || requested === 'claude-opus-4-6') {
        candidates.push('Claude Opus 4.6 (Thinking)', 'Claude Opus');
      }
      if (requested === 'haiku' || requested === 'claude-haiku-3-5' || requested === 'claude-haiku-4-5') {
        candidates.push('Claude Haiku');
      }
      return Array.from(new Set(candidates.map((value) => normalize(value)).filter(Boolean)));
    })();

    const findCurrentShellModelTrigger = () => {
      const ariaButton = doc.querySelector('button[aria-label^="Select model"]');
      if (ariaButton && ariaButton.offsetWidth > 0) return ariaButton;
      const exact = doc.querySelector('.flex.min-w-0.max-w-full.cursor-pointer.items-center');
      if (exact && exact.offsetWidth > 0) return exact;
      return Array.from(doc.querySelectorAll('div, button')).find((el) => {
        const cls = String(el.className || '');
        return cls.includes('min-w-0')
          && cls.includes('max-w-full')
          && cls.includes('cursor-pointer')
          && cls.includes('items-center')
          && el.offsetWidth > 0;
      }) || null;
    };

    const clickCurrentShellModel = (candidates) => {
      const items = Array.from(doc.querySelectorAll('.px-2.py-1.flex.items-center.justify-between.cursor-pointer'));
      for (const item of items) {
        const label = normalize(item.querySelector('.text-xs.font-medium')?.textContent || item.textContent || '');
        if (!label) continue;
        const labelLower = label.toLowerCase();
        const match = candidates.find((candidate) => {
          const targetLower = candidate.toLowerCase();
          return labelLower === targetLower || labelLower.includes(targetLower) || targetLower.includes(labelLower);
        });
        if (match) {
          item.click();
          return label;
        }
      }
      return null;
    };

    const currentShellTrigger = findCurrentShellModelTrigger();
    const currentShellModel = normalize(
      currentShellTrigger?.textContent
      || currentShellTrigger?.getAttribute?.('aria-label')?.replace(/^Select model, current:\s*/i, '')
      || ''
    );
    if (currentShellTrigger) {
      if (currentShellModel) {
        const currentLower = currentShellModel.toLowerCase();
        const alreadySelected = shellCandidates.some((candidate) => {
          const targetLower = candidate.toLowerCase();
          return currentLower === targetLower || currentLower.includes(targetLower) || targetLower.includes(currentLower);
        });
        if (alreadySelected) {
          return JSON.stringify({ ok: true, model: currentShellModel, currentValue: currentShellModel, changed: false, method: 'antigravity-shell' });
        }
      }
      const direct = clickCurrentShellModel(shellCandidates);
      if (direct) {
        await sleep(250);
        return JSON.stringify({ ok: true, model: direct, currentValue: direct, changed: true, method: 'antigravity-shell' });
      }
      currentShellTrigger.click();
      await sleep(350);
      const hit = clickCurrentShellModel(shellCandidates);
      if (hit) {
        await sleep(250);
        return JSON.stringify({ ok: true, model: hit, currentValue: hit, changed: true, method: 'antigravity-shell' });
      }
    }

    const visible = (el) => {
      if (!el || el.closest('[inert]')) return false;
      const rect = el.getBoundingClientRect();
      const style = (el.ownerDocument?.defaultView || view).getComputedStyle(el);
      return rect.width > 8 && rect.height > 8 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const aliases = {
      default: { menuLabel: 'Default (recommended)', cacheValue: 'default' },
      sonnet: { menuLabel: 'Default (recommended)', cacheValue: 'default' },
      'claude-sonnet-4-6': { menuLabel: 'Default (recommended)', cacheValue: 'default' },
      opus: { menuLabel: 'Opus', cacheValue: 'opus' },
      'claude-opus-4': { menuLabel: 'Opus', cacheValue: 'opus' },
      'claude-opus-4-6': { menuLabel: 'Opus', cacheValue: 'opus' },
      haiku: { menuLabel: 'Haiku', cacheValue: 'haiku' },
      'claude-haiku-3-5': { menuLabel: 'Haiku', cacheValue: 'haiku' },
      'claude-haiku-4-5': { menuLabel: 'Haiku', cacheValue: 'haiku' },
    };
    const target = aliases[requested];
    if (!target) return JSON.stringify({ ok: false, error: `unsupported model: ${requestedRaw}` });

    const input = doc.querySelector('[role="textbox"].messageInput_cKsPxg');
    if (!input) {
      return JSON.stringify({ ok: false, error: `model not supported on the current Claude Code surface: ${requestedRaw}` });
    }

    const getCache = () => {
      if (!window.__adhdevClaudeCodeControls || typeof window.__adhdevClaudeCodeControls !== 'object') {
        window.__adhdevClaudeCodeControls = {};
      }
      return window.__adhdevClaudeCodeControls;
    };
    const clearInput = () => {
      input.focus();
      input.textContent = '';
      input.dispatchEvent(new view.InputEvent('input', {
        bubbles: true,
        inputType: 'deleteContentBackward',
        data: null,
      }));
      input.dispatchEvent(new view.Event('change', { bubbles: true }));
    };

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
    await sleep(250);

    const switchItem = Array.from(doc.querySelectorAll('.commandItem_G_S7FQ, [class*="commandItem"]'))
      .filter(visible)
      .find((el) => {
        const text = normalize(el.textContent || '');
        const title = normalize(el.getAttribute('title') || '');
        return /switch model/i.test(text) || /change the ai model/i.test(title);
      });
    if (!switchItem) {
      clearInput();
      return JSON.stringify({ ok: false, error: 'switch model item not found' });
    }

    switchItem.click();
    await sleep(250);

    const modelItem = Array.from(doc.querySelectorAll('.modelItem_G8AMvA, [class*="modelItem"]'))
      .filter(visible)
      .find((el) => {
        const label = normalize(
          el.querySelector('.modelLabel_G8AMvA, [class*="modelLabel"]')?.textContent
          || el.textContent
          || ''
        );
        return label === target.menuLabel;
      });
    if (!modelItem) {
      doc.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      clearInput();
      return JSON.stringify({ ok: false, error: `model option not found: ${target.menuLabel}` });
    }

    const label = normalize(
      modelItem.querySelector('.modelLabel_G8AMvA, [class*="modelLabel"]')?.textContent
      || modelItem.textContent
      || target.menuLabel
    );
    const active = /activeModelItem/i.test(normalize(modelItem.className || ''));

    if (!active) {
      modelItem.click();
      await sleep(250);
    }

    doc.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    clearInput();

    const cache = getCache();
    cache.model = target.cacheValue;
    cache.modelLabel = label;

    return JSON.stringify({
      ok: true,
      model: target.cacheValue,
      currentValue: target.cacheValue,
      label,
      changed: !active,
      method: 'gui',
    });
  } catch (e) {
    return JSON.stringify({ ok: false, error: e.message || String(e) });
  }
})()
