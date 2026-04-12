;(async () => {
  try {
    const target = ${ VALUE };
    if (typeof target !== 'boolean') {
      return JSON.stringify({ success: false, error: 'boolean value required' });
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

    const input = document.querySelector('[role="textbox"].messageInput_cKsPxg');
    if (!input) return JSON.stringify({ success: false, error: 'input not found' });

    input.focus();
    input.textContent = '/';
    input.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: '/',
    }));
    input.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: '/',
    }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 250));

    const commandItem = Array.from(document.querySelectorAll('[title="Toggle extended thinking mode"], .commandItem_G_S7FQ, [class*="commandItem"]'))
      .filter(visible)
      .find((el) => {
        const text = normalize(el.textContent || el.getAttribute('aria-label') || '');
        const title = normalize(el.getAttribute('title') || '');
        return text === 'Thinking' || /extended thinking/i.test(title);
      });

    if (!commandItem) {
      return JSON.stringify({ success: false, error: 'thinking toggle not found' });
    }

    const track = commandItem.querySelector('.track_0c4GDA, [class*="track"]');
    const current = !!(track && /active|checked|enabled|selected|on/i.test(track.className || ''));

    if (current !== target) {
      commandItem.click();
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    input.textContent = '';
    input.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'deleteContentBackward',
      data: null,
    }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    getCache().thinking = target;
    return JSON.stringify({ success: true, thinking: target, changed: current !== target });
  } catch (e) {
    return JSON.stringify({ success: false, error: e.message || String(e) });
  }
})()
