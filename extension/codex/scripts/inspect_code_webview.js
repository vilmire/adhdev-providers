/**
 * Check the raw DOM structure of message 15 (code block message)
 */
(() => {
  try {
    const turnEls = document.querySelectorAll('[data-content-search-turn-key]');
    const results = [];
    
    for (const turnEl of turnEls) {
      const unitEls = turnEl.querySelectorAll('[data-content-search-unit-key]');
      for (const unitEl of unitEls) {
        const unitKey = unitEl.getAttribute('data-content-search-unit-key') || '';
        const parts = unitKey.split(':');
        const role = parts[parts.length - 1];
        
        if (role === 'assistant') {
          // Look for code/pre elements
          const pres = unitEl.querySelectorAll('pre');
          const codes = unitEl.querySelectorAll('code');
          
          if (pres.length > 0 || codes.length > 0) {
            // Dump the inner structure
            const dumpEl = (el, depth) => {
              if (depth > 5) return [];
              const items = [];
              for (const child of el.children) {
                items.push({
                  depth,
                  tag: child.tagName?.toLowerCase(),
                  class: (child.className && typeof child.className === 'string') ? child.className.substring(0, 150) : null,
                  text: child.children.length === 0 ? (child.textContent || '').substring(0, 100) : '',
                  childCount: child.children.length,
                });
                items.push(...dumpEl(child, depth + 1));
              }
              return items;
            };
            
            results.push({
              unitKey: unitKey.substring(0, 60),
              preCount: pres.length,
              codeCount: codes.length,
              innerHTML: unitEl.innerHTML?.substring(0, 2000),
              tree: dumpEl(unitEl, 0).slice(0, 30),
            });
          }
        }
      }
    }
    
    return JSON.stringify({ messages: results.slice(-3) });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e) });
  }
})()
