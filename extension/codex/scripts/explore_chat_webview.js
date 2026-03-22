/**
 * Codex Extension — Chat View DOM Explorer
 * Run after clicking into a conversation to see message structure
 */
(() => {
  try {
    const root = document.getElementById('root');
    if (!root) return JSON.stringify({ error: 'no root' });

    // Header info
    const headerEl = document.querySelector('[style*="view-transition-name: header-title"]');
    const headerText = headerEl?.textContent?.trim() || '';

    // Find thread/message area (look for common React patterns)
    // Codex uses React + ProseMirror
    const allDivs = document.querySelectorAll('div');
    
    // Find message containers by looking for role/class patterns
    const messageAreas = [];
    for (const div of allDivs) {
      const cls = (div.className && typeof div.className === 'string') ? div.className : '';
      if (cls.includes('thread') || cls.includes('message') || 
          cls.includes('turn-') || cls.includes('agent-') ||
          div.getAttribute('data-message-id') ||
          div.getAttribute('data-turn-id')) {
        messageAreas.push({
          class: cls.substring(0, 300),
          dataMessageId: div.getAttribute('data-message-id'),
          dataTurnId: div.getAttribute('data-turn-id'),
          role: div.getAttribute('role'),
          childCount: div.children?.length || 0,
          text: (div.textContent || '').trim().substring(0, 300),
        });
      }
    }

    // Look for the actual message list/scroll container
    const scrollContainers = document.querySelectorAll('[class*="overflow-y-auto"], [class*="scroll"]');
    const scrollInfo = Array.from(scrollContainers).slice(0, 10).map(el => ({
      tag: el.tagName?.toLowerCase(),
      class: (el.className && typeof el.className === 'string') ? el.className.substring(0, 300) : null,
      childCount: el.children?.length || 0,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      text: (el.textContent || '').trim().substring(0, 200),
    }));

    // Find React Fiber data
    let fiberInfo = null;
    const rootEl = document.getElementById('root');
    if (rootEl) {
      const fiberKey = Object.keys(rootEl).find(k => 
        k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
      );
      if (fiberKey) {
        let fiber = rootEl[fiberKey];
        const stateSnapshots = [];
        for (let d = 0; d < 30 && fiber; d++) {
          const props = fiber.memoizedProps || fiber.pendingProps;
          const state = fiber.memoizedState;
          if (props) {
            const propKeys = Object.keys(props).filter(k => k !== 'children');
            if (propKeys.length > 0) {
              stateSnapshots.push({
                depth: d,
                type: fiber.type?.name || fiber.type?.displayName || (typeof fiber.type === 'string' ? fiber.type : '?'),
                propKeys: propKeys.slice(0, 10),
              });
            }
          }
          fiber = fiber.child || fiber.return;
          if (stateSnapshots.length > 15) break;
        }
        fiberInfo = stateSnapshots;
      }
    }

    // Full structure dump of children of root
    const rootChildren = rootEl ? Array.from(rootEl.children) : [];
    const structure = [];
    const dumpChildren = (el, depth, maxDepth) => {
      if (depth > maxDepth) return;
      for (const child of el.children) {
        const cls = (child.className && typeof child.className === 'string') ? child.className : '';
        structure.push({
          depth,
          tag: child.tagName?.toLowerCase(),
          class: cls.substring(0, 200),
          id: child.id || null,
          childCount: child.children?.length || 0,
          text: child.children?.length === 0 ? (child.textContent || '').trim().substring(0, 100) : '',
        });
        if (structure.length < 60) {
          dumpChildren(child, depth + 1, maxDepth);
        }
      }
    };
    if (rootEl) dumpChildren(rootEl, 0, 4);

    return JSON.stringify({
      headerText,
      messageAreas: messageAreas.slice(0, 20),
      scrollContainers: scrollInfo,
      fiberInfo,
      structure: structure.slice(0, 60),
    });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e) });
  }
})()
