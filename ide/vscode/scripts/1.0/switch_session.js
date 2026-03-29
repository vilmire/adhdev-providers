async (params) => {
  try {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const isVisible = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const click = (el) => {
      if (!el) return false;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      el.click();
      return true;
    };
    const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const rows = Array.from(document.querySelectorAll('.agent-sessions-viewer .monaco-list-row')).filter(isVisible);

    let target = null;
    if (params && params.id) {
      target = rows.find((row) => row.id === params.id);
    }
    if (!target && params && typeof params.index === 'number') {
      target = rows[params.index] || null;
    }
    if (!target && params && params.title) {
      target = rows.find((row) => {
        const text = normalize(row.querySelector('.monaco-highlighted-label, .label-name, .title, .monaco-icon-label')?.textContent || row.getAttribute('aria-label') || row.textContent);
        return text.includes(normalize(params.title));
      });
    }

    if (!target) {
      return JSON.stringify({ switched: false, error: 'Session not found' });
    }

    click(target);
    await wait(250);

    return JSON.stringify({ switched: true });
  } catch (e) {
    return JSON.stringify({ switched: false, error: e.message });
  }
}
