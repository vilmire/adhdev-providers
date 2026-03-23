/**
 * Codex Extension — list_modes
 *
 * Finds the mode / autonomy dropdown next to the model chip in the composer footer,
 * opens it (Radix), reads options, closes. UI expects `modes` + `current` (see ModelModeBar).
 *
 * Uses the same multi-searchRoot strategy as readChat for reliable mode button discovery.
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

    function isModelText(text) {
      return /^(GPT-|gpt-|o\d|claude-|sonnet|opus)/i.test(text);
    }

    /**
     * Find the mode menu button using the same multi-root strategy as readChat.
     * Searches multiple container scopes and both doc frames.
     */
    function findModeButton(doc) {
      for (const d of [doc, document]) {
        const searchRoots = [
          d.querySelector('[class*="thread-composer-max-width"]'),
          d.querySelector('[class*="thread-composer"]'),
          d.querySelector('[class*="pb-2"]'),
          d.body,
        ].filter(Boolean);

        for (const searchRoot of searchRoots) {
          const menuBtns = Array.from(searchRoot.querySelectorAll('button[aria-haspopup="menu"]'))
            .filter(b => b.offsetWidth > 0);
          for (const btn of menuBtns) {
            const text = (btn.textContent || '').trim();
            // Skip model buttons — we want the mode button
            if (!isModelText(text) && text.length > 0 && text.length < 30) {
              return btn;
            }
          }
        }
      }
      return null;
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

    const modeBtn = findModeButton(doc);
    if (!modeBtn) {
      return JSON.stringify({
        modes: [],
        current: '',
        currentMode: '',
        error: 'mode menu button not found',
      });
    }

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
