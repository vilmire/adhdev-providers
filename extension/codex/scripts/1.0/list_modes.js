/**
 * Codex Extension — list_modes
 *
 * Finds the mode / autonomy dropdown next to the model chip in the composer footer,
 * opens it (Radix), reads options, closes. UI expects `modes` + `current` (see ModelModeBar).
 */
(() => {
  try {
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

    /** Mode chip: menu trigger in composer that is not the model selector. */
    function findModeMenuButton(doc) {
      const composer =
        doc.querySelector('[class*="thread-composer-max-width"]') ||
        doc.querySelector('[class*="thread-composer"]') ||
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

    const { doc, root } = resolveDoc();
    if (!root) return JSON.stringify({ modes: [], current: '', currentMode: '', error: 'no root' });

    // Search both inner doc and outer document (composer footer may be in outer frame)
    const modeBtn = findModeMenuButton(doc) || (doc !== document ? findModeMenuButton(document) : null);
    if (!modeBtn) {
      return JSON.stringify({
        modes: [],
        current: '',
        currentMode: '',
        error: 'mode menu button not found',
      });
    }

    // Determine which document owns the button (for menu queries later)
    const menuDoc = modeBtn.ownerDocument || doc;
    const currentLabel = (modeBtn.textContent || '').trim();
    openMenu(modeBtn);

    return new Promise((resolve) => {
      setTimeout(() => {
        let menu = menuDoc.querySelector('[role="menu"][data-state="open"]');
        if (!menu) {
          menu = menuDoc.querySelector('[role="menu"]');
        }

        const collected = [];
        if (menu) {
          const items = menu.querySelectorAll(
            '[role="menuitem"], [role="menuitemradio"], [role="option"], div[class*="cursor-interaction"]',
          );
          for (const item of items) {
            const text = (item.textContent || '').trim();
            if (
              text &&
              text.length > 0 &&
              text.length < 80 &&
              !/^모델|^model\b|^select\b/i.test(text)
            ) {
              collected.push(text);
            }
          }
        }

        menuDoc.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            keyCode: 27,
            bubbles: true,
          }),
        );

        const modes = [...new Set(collected)];
        const out = {
          modes: modes.length > 0 ? modes : currentLabel ? [currentLabel] : [],
          current: currentLabel,
          currentMode: currentLabel,
        };
        resolve(JSON.stringify(out));
      }, 550);
    });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e), modes: [], current: '', currentMode: '' });
  }
})();
