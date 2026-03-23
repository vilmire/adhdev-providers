/**
 * Codex — Message structure deep dive
 * Find the actual message DOM elements within the thread
 */
(() => {
  try {
    // The thread content area
    const threadContent = document.querySelector('[class*="thread-content"]') 
      || document.querySelector('[class*="overflow-y-auto"][class*="px-panel"]');
    if (!threadContent) return JSON.stringify({ error: 'no thread content area' });

    // Get ALL elements with data attributes
    const dataAttrs = [];
    threadContent.querySelectorAll('*').forEach(el => {
      const attrs = el.attributes;
      for (let i = 0; i < attrs.length; i++) {
        if (attrs[i].name.startsWith('data-')) {
          dataAttrs.push({
            tag: el.tagName?.toLowerCase(),
            attr: attrs[i].name,
            value: attrs[i].value?.substring(0, 100),
            class: (el.className && typeof el.className === 'string') ? el.className.substring(0, 150) : null,
            text: (el.textContent || '').trim().substring(0, 100),
          });
        }
      }
    });

    // Dump full tree of message area (limited depth)
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
      dataAttrs: dataAttrs.slice(0, 30),
      tree: tree.slice(0, 80),
      composerInfo,
      footerButtons,
    });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e) });
  }
})()
