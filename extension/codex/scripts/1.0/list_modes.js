/**
 * Codex Extension — list_modes
 *
 * Finds the mode/autonomy dropdown by locating the model button (GPT-* text)
 * and clicking the NEXT haspopup=menu button in DOM order (the brain icon).
 * Opens it (Radix), reads options + selected, closes.
 */
(() => {
  try {
    function resolveDoc() {
      let doc = document;
      let root = doc.getElementById('root');
      if (!root) {
        for (const iframe of doc.querySelectorAll('iframe')) {
          try {
            const innerDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (innerDoc?.getElementById('root')) { doc = innerDoc; root = innerDoc.getElementById('root'); break; }
          } catch (e) {}
        }
      }
      return { doc, root };
    }

    function getText(el) {
      if (!el) return '';
      return ((el.textContent || '').trim() || (el.getAttribute('aria-label') || '').trim()).replace(/\s+/g, ' ');
    }

    function isVisible(el) {
      return !!el && el.offsetWidth > 0 && el.offsetHeight > 0 && !el.closest('[inert]');
    }

    function clickElement(el) {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: cx, clientY: cy, pointerId: 1 }));
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: cx, clientY: cy }));
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: cx, clientY: cy, pointerId: 1 }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: cx, clientY: cy }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: cx, clientY: cy }));
    }

    const { doc, root } = resolveDoc();
    if (!root) return JSON.stringify({ modes: [], current: '', currentMode: '', error: 'no root' });

    // Step 1: Find ALL haspopup=menu buttons in DOM order across the entire document
    const allMenuBtns = Array.from(doc.querySelectorAll('button[aria-haspopup="menu"]'))
      .filter(b => isVisible(b));

    // Step 2: Find the model button (GPT-* text)
    const modelIdx = allMenuBtns.findIndex(b => /^(GPT-|gpt-|o\d|claude-|sonnet|opus)/i.test(getText(b)));
    if (modelIdx < 0) {
      return JSON.stringify({ modes: [], current: '', currentMode: '', error: 'model button not found' });
    }

    // Step 3: The mode button is the NEXT haspopup=menu button after the model button
    if (modelIdx + 1 >= allMenuBtns.length) {
      return JSON.stringify({ modes: [], current: '', currentMode: '', error: 'no button after model button' });
    }
    const modeBtn = allMenuBtns[modelIdx + 1];

    // Step 4: Click the mode button and read the dropdown
    clickElement(modeBtn);

    return new Promise((resolve) => {
      setTimeout(() => {
        const menu =
          doc.querySelector('[role="menu"][data-state="open"]') ||
          doc.querySelector('[role="listbox"][data-state="open"]') ||
          Array.from(doc.querySelectorAll('[role="menu"], [role="listbox"]')).find(isVisible) ||
          null;

        if (!menu) {
          doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
          resolve(JSON.stringify({ modes: [], current: '', currentMode: '', error: 'mode menu did not open' }));
          return;
        }

        // Read menu items
        const items = Array.from(
          menu.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="option"], div[class*="cursor-interaction"]')
        )
          .map(item => {
            const text = getText(item);
            const svgCount = item.querySelectorAll('svg').length;
            const selected =
              item.getAttribute('aria-checked') === 'true' ||
              item.getAttribute('data-state') === 'checked' ||
              !!item.querySelector('[data-state="checked"], [aria-checked="true"]') ||
              // Codex uses an extra checkmark SVG on the selected mode item
              svgCount >= 2;
            return { text, selected };
          })
          .filter(({ text }) => text && text.length > 0 && text.length < 80);

        const modes = items.map(i => i.text);
        const selectedItem = items.find(i => i.selected);
        const current = selectedItem ? selectedItem.text : '';

        // Close the menu
        doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));

        setTimeout(() => {
          resolve(JSON.stringify({
            modes,
            current,
            currentMode: current,
          }));
        }, 50);
      }, 350);
    });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e), modes: [], current: '', currentMode: '' });
  }
})();
