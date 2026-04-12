;(async () => {
  try {
    const frame = document.getElementById('active-frame');
    const doc = frame?.contentDocument || frame?.contentWindow?.document || document;
    const view = doc.defaultView || window;
    const requested = String(${ MODEL } || '').trim().toLowerCase();
    if (!requested) return JSON.stringify({ success: false, error: 'model required' });

    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = (el) => {
      if (!el || el.closest('[inert]')) return false;
      const rect = el.getBoundingClientRect();
      const style = (el.ownerDocument?.defaultView || view).getComputedStyle(el);
      return rect.width > 8 && rect.height > 8 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    if (!target) return JSON.stringify({ success: false, error: `unsupported model: ${requested}` });

    const input = doc.querySelector('[role="textbox"].messageInput_cKsPxg');
    if (!input) {
      return JSON.stringify({ success: false, error: 'input not found' });
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
      return JSON.stringify({ success: false, error: 'switch model item not found' });
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
      return JSON.stringify({ success: false, error: `model option not found: ${target.menuLabel}` });
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
      success: true,
      model: target.cacheValue,
      label,
      changed: !active,
      method: 'gui',
    });
  } catch (e) {
    return JSON.stringify({ success: false, error: e.message || String(e) });
  }
})()
