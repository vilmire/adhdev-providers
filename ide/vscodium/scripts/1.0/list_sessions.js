;(async () => {
  try {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const isVisible = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const click = (el) => {
      if (!el) return false;
      try {
        el.scrollIntoView({ block: 'center', inline: 'center' });
      } catch (_) {}
      el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, composed: true }));
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, composed: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
      return true;
    };
    const isSectionRow = (row) => {
      const aria = normalize(row?.getAttribute('aria-label'));
      return !!row && (row.querySelector('.agent-session-section') || /sessions section/i.test(aria));
    };
    const getRows = () =>
      Array.from(document.querySelectorAll('.agent-sessions-viewer .monaco-list-row[role="listitem"], .agent-sessions-viewer .monaco-list-row')).filter(
        (row) => normalize(row.textContent || row.getAttribute('aria-label')) && !isSectionRow(row)
      );
    const ensureSessionsAvailable = async () => {
      let rows = getRows();
      if (rows.length) return rows;

      const showSidebarButton = Array.from(document.querySelectorAll('.chat-view-title-container a[role="button"], .chat-view-title-container [role="button"]')).find(
        (el) => isVisible(el) && /agent sessions sidebar/i.test(normalize(el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent))
      );
      if (showSidebarButton && /show/i.test(normalize(showSidebarButton.getAttribute('aria-label')))) {
        click(showSidebarButton);
        await wait(300);
      }

      return getRows();
    };
    const parseTitle = (row, index) => {
      const label = normalize(
        row.querySelector('.agent-session-title .monaco-highlighted-label, .agent-session-title .label-name, .agent-session-title, .monaco-highlighted-label, .label-name, .title, .monaco-icon-label')?.textContent ||
          row.getAttribute('aria-label') ||
          row.textContent ||
          `Session ${index + 1}`
      );
      const aria = normalize(row.getAttribute('aria-label'));
      return (label || aria)
        .replace(/^local session\s+/i, '')
        .replace(/\s*\((completed|failed|running|pending)\).*$/i, '')
        .replace(/,?\s*created\s+.+$/i, '')
        .replace(/\s+\d+\s*(mins?|hours?|hrs?|days?)\s+ago$/i, '')
        .trim();
    };

    const rows = await ensureSessionsAvailable();
    const activeTitle = normalize(
      document.querySelector('.chat-view-title-label')?.textContent ||
        document.querySelector('.agent-sessions-viewer .monaco-list-row.selected .agent-session-title, .agent-sessions-viewer .monaco-list-row.focused .agent-session-title, .agent-sessions-viewer .monaco-list-row[aria-selected="true"] .agent-session-title')?.textContent ||
        ''
    ).toLowerCase();
    const hasSelectedRow = rows.some(
      (row) =>
        row.classList.contains('selected') ||
        row.classList.contains('focused') ||
        row.getAttribute('aria-selected') === 'true' ||
        row.getAttribute('aria-current') === 'true'
    );

    const sessions = rows.map((row, index) => {
      const title = parseTitle(row, index);
      const rowTitle = title.toLowerCase();
      return {
        id: row.id || `session-${index}`,
        title,
        active:
          row.classList.contains('selected') ||
          row.classList.contains('focused') ||
          row.getAttribute('aria-selected') === 'true' ||
          row.getAttribute('aria-current') === 'true' ||
          (!hasSelectedRow && !!activeTitle && rowTitle === activeTitle),
        index
      };
    });

    return JSON.stringify({ sessions });
  } catch (e) {
    return JSON.stringify({ sessions: [], error: e.message });
  }
})()
