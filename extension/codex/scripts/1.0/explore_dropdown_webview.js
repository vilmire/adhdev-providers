/**
 * Codex — Test different click methods on model button
 */
(() => {
  try {
    const buttons = Array.from(document.querySelectorAll('button')).filter(b => b.offsetWidth > 0);
    const modelBtn = buttons.find(b => {
      const text = (b.textContent || '').trim();
      return /^(GPT-|gpt-|o\d|claude-)/i.test(text) && b.getAttribute('aria-haspopup') === 'menu';
    });

    if (!modelBtn) return JSON.stringify({ error: 'Model button not found' });

    const rect = modelBtn.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    // Method 1: MouseEvent sequence (more realistic)
    modelBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y }));
    modelBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
    modelBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y }));
    modelBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
    modelBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));

    return new Promise((resolve) => {
      setTimeout(() => {
        const btnState = {
          ariaExpanded: modelBtn.getAttribute('aria-expanded'),
          dataState: modelBtn.getAttribute('data-state'),
        };

        // Check for open elements
        const allElements = document.querySelectorAll('*');
        const openElements = [];
        for (const el of allElements) {
          const ds = el.getAttribute('data-state');
          const role = el.getAttribute('role');
          if (ds === 'open' || role === 'menu' || role === 'listbox') {
            openElements.push({
              tag: el.tagName?.toLowerCase(),
              role, dataState: ds,
              childCount: el.children?.length || 0,
              text: (el.textContent || '').trim().substring(0, 300),
            });
          }
        }

        // Close
        document.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true
        }));

        resolve(JSON.stringify({
          btnRect: { x: Math.round(x), y: Math.round(y), w: Math.round(rect.width), h: Math.round(rect.height) },
          btnState,
          openElementCount: openElements.length,
          openElements,
        }));
      }, 800);
    });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e) });
  }
})()
