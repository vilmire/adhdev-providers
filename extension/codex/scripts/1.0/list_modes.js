/**
 * Codex Extension — list_modes
 *
 * Finds the mode/autonomy dropdown in hosted Codex webviews, even when the
 * controls live in the outer document and the picker is rendered as a listbox.
 */
(() => {
  try {
    const knownModes = new Set(['ask', 'edit', 'agent', 'full auto', 'auto', 'read only', 'planning', 'fast', 'normal']);
    const workspaceLabels = new Set(['local', 'remote', 'workspace']);
    const permissionWords = ['permission', 'permissions', 'access', 'read', 'write', 'approval', 'approve', 'sandbox'];

    function resolveDoc() {
      let doc = document;
      let root = doc.getElementById('root');
      if (!root) {
        for (const iframe of doc.querySelectorAll('iframe')) {
          try {
            const innerDoc = iframe.contentDocument || iframe.contentWindow?.document;
            const innerRoot = innerDoc?.getElementById('root');
            if (innerRoot) {
              doc = innerDoc;
              root = innerRoot;
              break;
            }
          } catch (e) {
            // ignore cross-origin iframes
          }
        }
      }
      return { doc, root };
    }

    function getText(el) {
      if (!el) return '';
      return ((el.textContent || '').trim() || (el.getAttribute('aria-label') || '').trim()).replace(/\s+/g, ' ');
    }

    function normalize(text) {
      return (text || '').trim().replace(/\s+/g, ' ').toLowerCase();
    }

    function isVisible(el) {
      if (!el || el.closest?.('[inert]')) return false;
      const rect = el.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) return false;
      const style = el.ownerDocument?.defaultView?.getComputedStyle?.(el);
      if (style && (style.visibility === 'hidden' || style.display === 'none' || style.pointerEvents === 'none')) {
        return false;
      }
      return true;
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

    function getMenuItems(picker) {
      return Array.from(
        picker.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="option"], div[class*="cursor-interaction"]'),
      )
        .map((item) => {
          const text = getText(item);
          const lower = normalize(text);
          const selected =
            item.getAttribute('aria-checked') === 'true' ||
            item.getAttribute('data-state') === 'checked' ||
            !!item.querySelector?.('[data-state="checked"], [aria-checked="true"]') ||
            item.querySelectorAll?.('svg')?.length >= 2;
          return { text, lower, selected };
        })
        .filter(({ text, lower }) => {
          if (!text || text.length > 120) return false;
          if (/^select\b|^model\b/i.test(text)) return false;
          if (/^(GPT-|gpt-|o\d|claude-|sonnet|opus)/i.test(text)) return false;
          if (workspaceLabels.has(lower)) return false;
          return true;
        });
    }

    function getCandidateButtons(doc) {
      const buttons = [];
      for (const searchDoc of [doc, document]) {
        const searchRoots = [
          searchDoc.querySelector('[class*="thread-composer-max-width"]'),
          searchDoc.querySelector('[class*="thread-composer"]'),
          searchDoc.querySelector('[class*="pb-2"]'),
          searchDoc.body,
        ].filter(Boolean);

        for (const searchRoot of searchRoots) {
          for (const button of searchRoot.querySelectorAll('button[aria-haspopup="menu"]')) {
            if (!isVisible(button) || buttons.includes(button)) continue;
            const text = getText(button);
            const lower = normalize(text);
            const aria = normalize(button.getAttribute('aria-label') || '');
            if (/^(GPT-|gpt-|o\d|claude-|sonnet|opus)/i.test(text)) continue;
            if (workspaceLabels.has(lower)) continue;
            if (aria.includes('add files')) continue;
            buttons.push(button);
          }
        }
      }
      return buttons;
    }

    function hasVisibleSessionRows(doc) {
      return Array.from(doc.querySelectorAll('div[role="button"], [role="button"], div, li, a'))
        .filter(isVisible)
        .some((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.top < 24 || rect.top > 220 || rect.height < 20 || rect.height > 56) return false;
          return !!el.querySelector('.tabular-nums, [class*="tabular-nums"], [class*="text-right"]');
        });
    }

    function findOpenPicker(doc) {
      const candidates = [
        ...Array.from(doc.querySelectorAll('[role="menu"][data-state="open"], [role="listbox"][data-state="open"]')),
        ...Array.from(doc.querySelectorAll('[role="menu"], [role="listbox"]')).filter(isVisible),
      ];
      return candidates.find(isVisible) || null;
    }

    function scoreCandidate(buttonText, items) {
      if (items.length === 0) return -1;
      const buttonLower = normalize(buttonText);
      let score = 0;
      if (buttonLower && !workspaceLabels.has(buttonLower)) score += 2;
      if (knownModes.has(buttonLower)) score += 12;
      if (items.some(({ lower }) => knownModes.has(lower))) score += 8;
      if (items.some(({ lower }) => permissionWords.some((word) => lower.includes(word)))) score += 8;
      if (permissionWords.some((word) => buttonLower.includes(word))) score += 10;
      if (items.length >= 2 && items.length <= 8) score += 3;
      return score;
    }

    const { doc } = resolveDoc();
    const inTaskList = !doc.querySelector('[data-content-search-turn-key]') && hasVisibleSessionRows(doc);
    if (inTaskList) {
      return JSON.stringify({ modes: [], current: '', currentMode: '', error: 'task list visible; open a Codex thread first' });
    }
    const candidates = getCandidateButtons(doc);
    if (candidates.length === 0) {
      return JSON.stringify({ modes: [], current: '', currentMode: '', error: 'mode menu button not found' });
    }

    return new Promise((resolve) => {
      const inspected = [];

      const inspectCandidate = (index) => {
        if (index >= candidates.length) {
          const best = inspected.sort((a, b) => b.score - a.score)[0];
          if (!best) {
            resolve(JSON.stringify({ modes: [], current: '', currentMode: '', error: 'mode menu did not open' }));
            return;
          }
          resolve(JSON.stringify({
            modes: best.items.map(({ text }) => text),
            current: best.current || '',
            currentMode: best.current || '',
          }));
          return;
        }

        const button = candidates[index];
        const menuDoc = button.ownerDocument || doc;
        clickElement(button);

        setTimeout(() => {
          const picker = findOpenPicker(menuDoc);
          const items = picker ? getMenuItems(picker) : [];
          const selected = items.find((item) => item.selected);
          const current = selected?.text || getText(button);
          inspected.push({
            current,
            items,
            score: scoreCandidate(getText(button), items),
          });

          menuDoc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
          setTimeout(() => inspectCandidate(index + 1), 80);
        }, 260);
      };

      inspectCandidate(0);
    });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e), modes: [], current: '', currentMode: '' });
  }
})();
