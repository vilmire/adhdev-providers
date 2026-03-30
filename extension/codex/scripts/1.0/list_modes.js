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
    const knownModes = new Set(['low', 'medium', 'high', 'extra high']);
    const workspaceLabels = new Set(['local', 'remote', 'workspace']);
    const permissionWords = ['permission', 'permissions', 'access', 'read', 'write', 'approval', 'approve', 'sandbox'];

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

    function getText(el) {
      if (!el) return '';
      return ((el.textContent || '').trim() || (el.getAttribute('aria-label') || '').trim()).replace(/\s+/g, ' ');
    }

    function isVisible(el) {
      return !!el && el.offsetWidth > 0 && el.offsetHeight > 0 && !el.closest('[inert]');
    }

    function normalize(text) {
      return (text || '').trim().replace(/\s+/g, ' ').toLowerCase();
    }

    function clickElement(el) {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      el.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, clientX: cx, clientY: cy, pointerId: 1 }),
      );
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: cx, clientY: cy }));
      el.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, clientX: cx, clientY: cy, pointerId: 1 }),
      );
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: cx, clientY: cy }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: cx, clientY: cy }));
    }

    function getMenuItems(menu) {
      return Array.from(
        menu.querySelectorAll(
          '[role="menuitem"], [role="menuitemradio"], [role="option"], div[class*="cursor-interaction"]',
        ),
      )
        .map((item) => {
          const text = getText(item);
          const lower = normalize(text);
          return {
            el: item,
            text,
            lower,
            selected:
              item.getAttribute('aria-checked') === 'true' ||
              item.getAttribute('data-state') === 'checked' ||
              !!item.querySelector('[data-state="checked"], [aria-checked="true"]'),
          };
        })
        .filter(({ text, lower }) => {
          if (!text || text.length > 120) return false;
          if (/^select\b|^model\b/i.test(text)) return false;
          if (isModelText(text)) return false;
          if (workspaceLabels.has(lower)) return false;
          return true;
        });
    }

    function getCandidateButtons(doc) {
      const buttons = [];
      for (const d of [doc, document]) {
        const searchRoots = [
          d.querySelector('[class*="thread-composer-max-width"]'),
          d.querySelector('[class*="thread-composer"]'),
          d.querySelector('[class*="pb-2"]'),
          d.body,
        ].filter(Boolean);

        for (const searchRoot of searchRoots) {
          for (const btn of searchRoot.querySelectorAll('button[aria-haspopup="menu"]')) {
            if (!isVisible(btn) || buttons.includes(btn)) continue;
            const text = getText(btn);
            const lower = normalize(text);
            const aria = normalize(btn.getAttribute('aria-label') || '');
            if (isModelText(text)) continue;
            if (workspaceLabels.has(lower)) continue;
            if (aria.includes('add files')) continue;
            buttons.push(btn);
          }
        }
      }
      return buttons;
    }

    function scoreCandidate(buttonText, items) {
      if (items.length === 0) return -1;
      const buttonLower = normalize(buttonText);
      let score = 0;
      if (buttonLower && !workspaceLabels.has(buttonLower)) score += 2;
      if (items.some(({ lower }) => knownModes.has(lower))) score += 8;
      if (items.some(({ lower }) => permissionWords.some((word) => lower.includes(word)))) score += 8;
      if (permissionWords.some((word) => buttonLower.includes(word))) score += 10;
      if (items.length >= 2 && items.length <= 8) score += 3;
      return score;
    }

    const { doc, root } = resolveDoc();
    if (!root) return JSON.stringify({ modes: [], current: '', currentMode: '', error: 'no root' });

    const candidates = getCandidateButtons(doc);
    if (candidates.length === 0) {
      return JSON.stringify({
        modes: [],
        current: '',
        currentMode: '',
        error: 'mode menu button not found',
      });
    }

    return new Promise((resolve) => {
      const results = [];
      const inspectCandidate = (index) => {
        if (index >= candidates.length) {
          const best = results.sort((a, b) => b.score - a.score)[0];
          if (!best) {
            resolve(JSON.stringify({ modes: [], current: '', currentMode: '', error: 'mode menu did not open' }));
            return;
          }
          const modes = [...new Set(best.items.map(({ text }) => text))];
          const current = best.selected || best.buttonText || '';
          resolve(JSON.stringify({
            modes: modes.length > 0 ? modes : current ? [current] : [],
            current,
            currentMode: current,
          }));
          return;
        }

        const btn = candidates[index];
        const menuDoc = btn.ownerDocument || doc;
        const buttonText = getText(btn);
        clickElement(btn);

        setTimeout(() => {
          const menu =
            menuDoc.querySelector('[role="menu"][data-state="open"]') ||
            menuDoc.querySelector('[role="listbox"][data-state="open"]') ||
            Array.from(menuDoc.querySelectorAll('[role="menu"], [role="listbox"]')).find(isVisible) ||
            null;

          if (menu) {
            const items = getMenuItems(menu);
            const selected = items.find((item) => item.selected)?.text || buttonText;
            results.push({
              buttonText,
              items,
              selected,
              score: scoreCandidate(buttonText, items),
            });
          }

          menuDoc.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: 'Escape',
              code: 'Escape',
              keyCode: 27,
              bubbles: true,
            }),
          );

          setTimeout(() => inspectCandidate(index + 1), 120);
        }, 320);
      };

      inspectCandidate(0);
    });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e), modes: [], current: '', currentMode: '' });
  }
})();
