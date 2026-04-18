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
      return JSON.stringify({ options: [], currentValue: '', error: 'model selector not found' });
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
      return JSON.stringify({ options: [], currentValue: '', error: 'switch model item not found' });
    }

    switchItem.click();
    await sleep(250);

    const items = Array.from(doc.querySelectorAll('.modelItem_G8AMvA, [class*="modelItem"]'))
      .filter(visible)
      .map((item) => {
        const label = normalize(
          item.querySelector('.modelLabel_G8AMvA, [class*="modelLabel"]')?.textContent
          || item.textContent
          || ''
        );
        const className = normalize(item.className || '');
        const active = /activeModelItem|selected|checked/i.test(className)
          || item.getAttribute('aria-checked') === 'true'
          || item.getAttribute('aria-selected') === 'true';
        return label ? { label, active } : null;
      })
      .filter(Boolean);

    const currentValue = items.find((item) => item.active)?.label
      || normalize(getCache().modelLabel || getCache().model || '');

    if (currentValue) {
      getCache().model = currentValue;
      getCache().modelLabel = currentValue;
    }

    const options = dedupe(items.map((item) => item.label)).map((label) => ({ value: label, label }));

    doc.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    if (openedViaInput) clearInput();

    if (options.length > 0 || currentValue) {
      return JSON.stringify({ options, currentValue });
    }

    return JSON.stringify({ options: [], currentValue: '', error: 'model selector not found' });
  } catch (e) {
    return JSON.stringify({ options: [], currentValue: '', error: e.message || String(e) });
  }
})();
