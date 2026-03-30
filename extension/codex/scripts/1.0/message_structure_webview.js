/**
 * Codex — Message structure deep dive
 * Find the actual message DOM elements within the thread
 */
(() => {
  try {
    const threadContent =
      document.querySelector('[data-thread-find-target="conversation"]') ||
      document.querySelector('[data-content-search-turn-key]')?.closest('[class*="overflow-y-auto"]') ||
      document.querySelector('[class*="thread-content"]') ||
      document.querySelector('[class*="overflow-y-auto"][class*="px-panel"]');
    if (!threadContent) return JSON.stringify({ error: 'no thread content area' });

    const turns = Array.from(threadContent.querySelectorAll('[data-content-search-turn-key]')).map((turnEl) => {
      const turnKey = turnEl.getAttribute('data-content-search-turn-key');
      const units = Array.from(turnEl.querySelectorAll('[data-content-search-unit-key]')).map((unitEl) => ({
        unitKey: unitEl.getAttribute('data-content-search-unit-key'),
        class: typeof unitEl.className === 'string' ? unitEl.className.substring(0, 200) : '',
        text: (unitEl.textContent || '').trim().substring(0, 200),
        hasCode: !!unitEl.querySelector('pre, code, [class*="code" i]'),
        hasTable: !!unitEl.querySelector('table'),
        hasList: !!unitEl.querySelector('ul, ol'),
        directChildren: Array.from(unitEl.children).slice(0, 8).map((child) => ({
          tag: child.tagName?.toLowerCase(),
          class: typeof child.className === 'string' ? child.className.substring(0, 160) : '',
          text: child.children.length === 0 ? (child.textContent || '').trim().substring(0, 120) : '',
          childCount: child.children.length,
        })),
      }));

      return {
        turnKey,
        class: typeof turnEl.className === 'string' ? turnEl.className.substring(0, 200) : '',
        unitCount: units.length,
        text: (turnEl.textContent || '').trim().substring(0, 240),
        units,
      };
    });

    const tree = [];
    const walk = (el, depth) => {
      if (depth > 6 || tree.length > 80) return;
      const cls = (el.className && typeof el.className === 'string') ? el.className : '';
      tree.push({
        depth,
        tag: el.tagName?.toLowerCase(),
        class: cls.substring(0, 250),
        id: el.id || null,
        role: el.getAttribute('role'),
        childCount: el.children?.length || 0,
        isLeaf: el.children?.length === 0,
        text: el.children?.length === 0 ? (el.textContent || '').trim().substring(0, 150) : '',
      });
      for (const child of el.children) {
        walk(child, depth + 1);
      }
    };
    walk(threadContent, 0);

    // Also check the composer/input area
    const proseMirror = document.querySelector('.ProseMirror');
    const composerInfo = proseMirror ? {
      tag: proseMirror.tagName?.toLowerCase(),
      class: proseMirror.className?.substring(0, 200),
      contentEditable: proseMirror.contentEditable,
      text: (proseMirror.textContent || '').trim().substring(0, 100),
      childCount: proseMirror.children?.length || 0,
      innerHTML: proseMirror.innerHTML?.substring(0, 300),
    } : null;

    // Footer area (model, mode selectors)
    const footer = document.querySelector('[class*="thread-composer-max-width"][class*="pb-2"]');
    const footerButtons = footer ? Array.from(footer.querySelectorAll('button')).map(b => ({
      text: (b.textContent || '').trim().substring(0, 60),
      class: b.className?.substring(0, 100),
      ariaLabel: b.getAttribute('aria-label')?.substring(0, 60),
    })) : [];

    return JSON.stringify({
      threadContentClass: (threadContent.className && typeof threadContent.className === 'string') ? threadContent.className.substring(0, 300) : null,
      turnCount: turns.length,
      turns: turns.slice(-10),
      tree: tree.slice(0, 80),
      composerInfo,
      footerButtons,
    });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e) });
  }
})()
