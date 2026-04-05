;(async () => {
  try {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const isVisible = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const click = (el) => {
      if (!el) return false;
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, composed: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
      return true;
    };
    const button = document.querySelector('.chat-input-toolbar [aria-label*="Pick Model"], .chat-input-toolbars [aria-label*="Pick Model"]');
    if (!button || !isVisible(button)) {
      return JSON.stringify({ models: [], current: '', error: 'Model picker not found' });
    }

    const before = Array.from(document.querySelectorAll('.context-view .monaco-list[role="menu"], .context-view .monaco-list[role="listbox"]'));
    const current = normalize(button.textContent || (button.getAttribute('aria-label') || '').replace(/^.*?,\s*/, ''));

    click(button);
    await wait(250);

    const menu = Array.from(document.querySelectorAll('.context-view .monaco-list[role="menu"], .context-view .monaco-list[role="listbox"]')).find((el) => !before.includes(el) && isVisible(el)) || Array.from(document.querySelectorAll('.context-view .monaco-list[role="menu"], .context-view .monaco-list[role="listbox"]')).find(isVisible);
    const rows = menu ? Array.from(menu.querySelectorAll('.monaco-list-row[role^="menuitem"]')).filter((row) => normalize(row.textContent || row.getAttribute('aria-label'))) : [];
    const selected = rows.find((row) => row.getAttribute('aria-checked') === 'true');
    const models = rows
      .map((row) => normalize(row.querySelector('.title')?.textContent || row.getAttribute('aria-label') || row.textContent))
      .filter((name) => name && !/configure|other models/i.test(name))
      .map((name) => ({ name, id: name }));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));

    return JSON.stringify({
      models,
      current: normalize(selected?.querySelector('.title')?.textContent || selected?.getAttribute('aria-label') || current)
    });
  } catch (e) {
    return JSON.stringify({ models: [], current: '', error: e.message });
  }
})()
