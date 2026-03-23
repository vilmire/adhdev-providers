/**
 * Codex Extension — set_mode
 *
 * Opens the mode dropdown (same discovery as list_modes), selects an item matching ${MODE}.
 *
 * Placeholder: ${MODE}
 */
(() => {
  try {
    const targetMode = ${MODE};

    function resolveDoc() {
      let doc = document;
      let root = doc.getElementById('root');
      if (!root) {
        const iframes = doc.querySelectorAll('iframe');
        for (const iframe of iframes) {
          try {
            const innerDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (innerDoc?.getElementById('root')) {
              doc = innerDoc;
              root = innerDoc.getElementById('root');
              break;
            }
          } catch (e) { /* cross-origin */ }
        }
      }
      return { doc, root };
    }

    function isModelMenuButton(b) {
      const text = (b.textContent || '').trim();
      if (b.getAttribute('aria-haspopup') !== 'menu') return false;
      return /^(GPT-|gpt-|o\d|claude-|sonnet|opus)/i.test(text);
    }

    function findModeMenuButton(doc) {
      const composer =
        doc.querySelector('[class*="thread-composer-max-width"]') ||
        doc.querySelector('[class*="thread-composer"]') ||
        doc.querySelector('[class*="pb-2"]') ||
        doc.getElementById('root') ||
        doc.body;

      const buttons = Array.from(composer.querySelectorAll('button')).filter(
        (b) => b.offsetWidth > 0 && b.offsetHeight > 0,
      );

      const menuTriggers = buttons.filter(
        (b) => b.getAttribute('aria-haspopup') === 'menu' && !isModelMenuButton(b),
      );

      if (menuTriggers.length === 0) return null;

      const byAria = menuTriggers.find((b) => {
        const al = (b.getAttribute('aria-label') || '').toLowerCase();
        return /mode|agent|ask|plan|autonomy|codex|모드|에이전트|플랜/i.test(al);
      });
      if (byAria) return byAria;

      return menuTriggers[0];
    }

    function openMenu(btn) {
      const rect = btn.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      btn.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, clientX: cx, clientY: cy, pointerId: 1 }),
      );
      btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: cx, clientY: cy }));
      btn.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, clientX: cx, clientY: cy, pointerId: 1 }),
      );
      btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: cx, clientY: cy }));
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: cx, clientY: cy }));
    }

    function clickItem(el) {
      const ir = el.getBoundingClientRect();
      const ix = ir.left + ir.width / 2;
      const iy = ir.top + ir.height / 2;
      el.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, clientX: ix, clientY: iy }),
      );
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: ix, clientY: iy }));
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: ix, clientY: iy }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: ix, clientY: iy }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: ix, clientY: iy }));
    }

    const { doc, root } = resolveDoc();
    if (!root) return JSON.stringify({ success: false, error: 'no root' });

    const want =
      typeof targetMode === 'string'
        ? targetMode.trim()
        : targetMode != null
          ? String(targetMode).trim()
          : '';
    if (!want) return JSON.stringify({ success: false, error: 'empty mode' });

    const modeBtn = findModeMenuButton(doc) || (doc !== document ? findModeMenuButton(document) : null);
    if (!modeBtn) return JSON.stringify({ success: false, error: 'mode menu button not found' });

    const menuDoc = modeBtn.ownerDocument || doc;

    const currentLabel = (modeBtn.textContent || '').trim();
    if (currentLabel.toLowerCase() === want.toLowerCase()) {
      return JSON.stringify({ success: true, mode: currentLabel, changed: false });
    }

    openMenu(modeBtn);

    return new Promise((resolve) => {
      setTimeout(() => {
        let menu = menuDoc.querySelector('[role="menu"][data-state="open"]');
        if (!menu) menu = menuDoc.querySelector('[role="menu"]');

        if (!menu) {
          menuDoc.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }),
          );
          return resolve(JSON.stringify({ success: false, error: 'mode menu did not open' }));
        }

        const items = Array.from(
          menu.querySelectorAll(
            '[role="menuitem"], [role="menuitemradio"], [role="option"], div[class*="cursor-interaction"]',
          ),
        );

        const norm = (s) => (s || '').trim().toLowerCase();
        const wantN = norm(want);

        let match = items.find((el) => norm(el.textContent) === wantN);
        if (!match) {
          match = items.find((el) => norm(el.textContent).includes(wantN) || wantN.includes(norm(el.textContent)));
        }

        if (!match) {
          menuDoc.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }),
          );
          const available = items
            .map((el) => (el.textContent || '').trim())
            .filter((t) => t.length > 0 && t.length < 80);
          return resolve(
            JSON.stringify({
              success: false,
              error: `mode "${want}" not found`,
              available,
            }),
          );
        }

        const picked = (match.textContent || '').trim();
        clickItem(match);

        setTimeout(() => {
          resolve(JSON.stringify({ success: true, mode: picked, changed: true }));
        }, 350);
      }, 550);
    });
  } catch (e) {
    return JSON.stringify({ success: false, error: e.message || String(e) });
  }
})();
