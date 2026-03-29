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
      el.scrollIntoView({ block: 'center', inline: 'center' });
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      el.click();
      return true;
    };
    const button = document.querySelector('.chat-mode-picker-item [role="button"]');
    if (!button || !isVisible(button)) {
      return JSON.stringify({ modes: [], current: '', error: 'Mode picker not found' });
    }

    click(button);
    await wait(250);

    const menu = Array.from(document.querySelectorAll('.context-view .monaco-list[role="menu"]')).find(isVisible);
    const rows = menu ? Array.from(menu.querySelectorAll('.monaco-list-row[role^="menuitem"]')).filter(isVisible) : [];
    const modeRows = rows.filter((row) => !/configure/i.test(normalize(row.querySelector('.title')?.textContent || row.getAttribute('aria-label') || row.textContent)));
    const selected = modeRows.find((row) => row.getAttribute('aria-checked') === 'true');
    const modes = modeRows.map((row) => {
      const name = normalize(row.querySelector('.title')?.textContent || row.getAttribute('aria-label') || row.textContent);
      return { name, id: name };
    });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));

    return JSON.stringify({
      modes,
      current: normalize(selected?.querySelector('.title')?.textContent || selected?.getAttribute('aria-label') || '')
    });
  } catch (e) {
    return JSON.stringify({ modes: [], current: '', error: e.message });
  }
})()
