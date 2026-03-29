(() => {
  try {
    const isVisible = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const rows = Array.from(document.querySelectorAll('.agent-sessions-viewer .monaco-list-row')).filter(isVisible);
    const sessions = rows.map((row, index) => {
      const title = normalize(
        row.querySelector('.monaco-highlighted-label, .label-name, .title, .monaco-icon-label')?.textContent ||
          row.getAttribute('aria-label') ||
          row.textContent ||
          `Session ${index + 1}`
      );
      return {
        id: row.id || `session-${index}`,
        title,
        active:
          row.classList.contains('selected') ||
          row.classList.contains('focused') ||
          row.getAttribute('aria-selected') === 'true' ||
          row.getAttribute('aria-current') === 'true',
        index
      };
    });

    if (sessions.length === 0) {
      const selected = document.querySelector('.agent-sessions-viewer .monaco-list-row.selected, .agent-sessions-viewer .monaco-list-row.focused');
      const title = normalize(selected?.getAttribute('aria-label') || document.querySelector('.monaco-alert')?.textContent || 'New chat');
      sessions.push({ id: selected?.id || 'active', title, active: true, index: 0 });
    }

    return JSON.stringify({ sessions });
  } catch (e) {
    return JSON.stringify({ sessions: [], error: e.message });
  }
})()
