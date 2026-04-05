async (params) => {
  try {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const isVisible = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const click = (el) => {
      if (!el) return false;
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, composed: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
      return true;
    };
    const want = normalize(params?.model || params?.name || params?.id || '');
    if (!want) {
      return JSON.stringify({ success: false, error: 'Missing model' });
    }

    const button = document.querySelector('.chat-input-toolbar [aria-label*="Pick Model"], .chat-input-toolbars [aria-label*="Pick Model"]');
    if (!button || !isVisible(button)) {
      return JSON.stringify({ success: false, error: 'Model picker not found' });
    }

    click(button);
    await wait(250);

    const menu = Array.from(document.querySelectorAll('.context-view .monaco-list[role="menu"], .context-view .monaco-list[role="listbox"]')).find(isVisible);
    const rows = menu ? Array.from(menu.querySelectorAll('.monaco-list-row[role^="menuitem"]')).filter((row) => normalize(row.textContent || row.getAttribute('aria-label'))) : [];
    const target = rows.find((row) => {
      const name = normalize(row.querySelector('.title')?.textContent || row.getAttribute('aria-label') || row.textContent);
      return !/other models/.test(name) && (name === want || name.includes(want) || want.includes(name));
    });

    if (!target) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));
      return JSON.stringify({ success: false, error: 'Model not found' });
    }

    if (target.getAttribute('aria-disabled') === 'true' || /disabled/.test((target.className || '').toString().toLowerCase())) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));
      return JSON.stringify({ success: false, error: 'Model is disabled' });
    }

    click(target);
    await wait(250);

    return JSON.stringify({ success: true });
  } catch (e) {
    return JSON.stringify({ success: false, error: e.message });
  }
}
