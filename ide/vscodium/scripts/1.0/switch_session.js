async (params) => {
  try {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
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
    const isSessionRow = (row) => {
      if (!row) return false;
      const aria = normalize(row.getAttribute('aria-label'));
      const text = normalize(row.textContent || row.getAttribute('aria-label'));
      return !!text && !row.querySelector('.agent-session-section') && !/sessions section/i.test(aria);
    };
    const getRowTitle = (row) => normalize(
      row.querySelector('.agent-session-title .monaco-highlighted-label, .agent-session-title .label-name, .agent-session-title, .monaco-highlighted-label, .label-name, .title, .monaco-icon-label')?.textContent ||
        row.getAttribute('aria-label') ||
        row.textContent
    )
      .replace(/^local session\s+/i, '')
      .replace(/\s*\((completed|failed|running|pending)\).*$/i, '')
      .replace(/,?\s*created\s+.+$/i, '')
      .trim();
    const getSignature = () =>
      Array.from(document.querySelectorAll('.interactive-session .monaco-list-row.request, .interactive-session .monaco-list-row.response'))
        .map((row) => normalize(row.getAttribute('aria-label') || row.textContent))
        .filter(Boolean)
        .slice(-4)
        .join(' | ');
    const getActiveTitle = () => normalize(document.querySelector('.chat-view-title-label')?.textContent || '');
    const getRows = () =>
      Array.from(document.querySelectorAll('.agent-sessions-viewer .monaco-list-row[role="listitem"], .agent-sessions-viewer .monaco-list-row')).filter(isSessionRow);
    const ensureSidebar = async () => {
      let rows = getRows();
      if (rows.length && rows.some(isVisible)) return rows;

      const toggle = Array.from(document.querySelectorAll('.chat-view-title-container a[role="button"], .chat-view-title-container [role="button"]')).find((el) => {
        if (!isVisible(el)) return false;
        const label = normalize(el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent);
        return /agent sessions sidebar/.test(label);
      });

      if (toggle && /show/.test(normalize(toggle.getAttribute('aria-label') || toggle.textContent))) {
        click(toggle);
        await wait(350);
      }

      return getRows();
    };

    const rows = await ensureSidebar();
    const before = getSignature();
    const beforeTitle = getActiveTitle();

    let target = null;
    if (params && params.id) {
      target = rows.find((row) => row.id === params.id) || null;
    }
    if (!target && params && params.title) {
      const wanted = normalize(params.title);
      target = rows.find((row) => {
        const text = getRowTitle(row);
        return text === wanted || text.includes(wanted) || wanted.includes(text);
      }) || null;
    }
    if (!target && params && typeof params.index === 'number') {
      target = rows[params.index] || null;
    }

    if (!target) {
      return JSON.stringify({ switched: false, error: 'Session not found' });
    }

    const targetTitle = getRowTitle(target);
    const alreadyActive =
      target.classList.contains('selected') ||
      target.classList.contains('focused') ||
      target.getAttribute('aria-selected') === 'true' ||
      target.getAttribute('aria-current') === 'true' ||
      (!!targetTitle && getActiveTitle() === targetTitle);

    if (!alreadyActive) {
      click(target.querySelector('.agent-session-item, .monaco-tl-contents, .monaco-tl-row') || target);
    }

    let switched = alreadyActive;
    for (let attempt = 0; attempt < 10 && !switched; attempt += 1) {
      await wait(250);
      const after = getSignature();
      const afterTitle = getActiveTitle();
      const selected =
        target.classList.contains('selected') ||
        target.classList.contains('focused') ||
        target.getAttribute('aria-selected') === 'true' ||
        target.getAttribute('aria-current') === 'true';

      switched = selected && (
        (!!targetTitle && afterTitle === targetTitle) ||
        (!!after && after !== before) ||
        (!!afterTitle && afterTitle !== beforeTitle)
      );
    }

    return JSON.stringify({ switched });
  } catch (e) {
    return JSON.stringify({ switched: false, error: e.message });
  }
}
