/**
 * Codex Extension — set_mode
 *
 * Opens the mode dropdown and selects the requested item.
 */
(args = {}) => {
  try {
    const knownModes = new Set(['low', 'medium', 'high', 'extra high']);
    const workspaceLabels = new Set(['local', 'remote', 'workspace']);
    const permissionWords = ['permission', 'permissions', 'access', 'read', 'write', 'approval', 'approve', 'sandbox'];

    const findValue = (source, keys) => {
      if (typeof source === 'string') return source;
      const queue = [source];
      const seen = new Set();
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item || typeof item !== 'object' || seen.has(item)) continue;
        seen.add(item);
        for (const key of keys) {
          if (item[key] != null) return item[key];
        }
        for (const value of Object.values(item)) {
          if (value && typeof value === 'object') queue.push(value);
        }
      }
      return undefined;
    };

    const modeValue = findValue(args, ['mode', 'MODE']);
    const targetMode = modeValue != null ? String(modeValue) : '';

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

    function normalize(text) {
      return (text || '').trim().replace(/\s+/g, ' ').toLowerCase();
    }

    function isVisible(el) {
      return !!el && el.offsetWidth > 0 && el.offsetHeight > 0 && !el.closest('[inert]');
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
    if (!root) return JSON.stringify({ success: false, error: 'no root' });

    const want =
      typeof targetMode === 'string'
        ? targetMode.trim()
        : targetMode != null
          ? String(targetMode).trim()
          : '';

    const candidates = getCandidateButtons(doc);
    if (candidates.length === 0) return JSON.stringify({ success: false, error: 'mode menu button not found' });

    return new Promise((resolve) => {
      const wantN = normalize(want);
      const inspected = [];

      const nextCandidate = (index) => {
        if (index >= candidates.length) {
          if (!want) {
            const best = inspected.sort((a, b) => b.score - a.score)[0];
            if (best) {
              const alternate = best.items.find((item) => normalize(item.text) !== normalize(best.current));
              if (alternate) {
                clickElement(best.button);
                setTimeout(() => {
                  const menu =
                    (best.button.ownerDocument || doc).querySelector('[role="menu"][data-state="open"]') ||
                    (best.button.ownerDocument || doc).querySelector('[role="listbox"][data-state="open"]') ||
                    Array.from((best.button.ownerDocument || doc).querySelectorAll('[role="menu"], [role="listbox"]')).find(isVisible) ||
                    null;
                  const liveItems = menu ? getMenuItems(menu) : best.items;
                  const liveMatch = liveItems.find((item) => normalize(item.text) === normalize(alternate.text)) || alternate;
                  clickElement(liveMatch.el || liveMatch);
                  setTimeout(() => {
                    resolve(JSON.stringify({ success: true, mode: liveMatch.text, changed: true }));
                  }, 220);
                }, 280);
                return;
              }
            }
          }

          const available = [...new Set(inspected.flatMap((item) => item.items.map(({ text }) => text)))];
          resolve(JSON.stringify({
            success: false,
            error: want ? `mode "${want}" not found` : 'no alternate mode found',
            available,
          }));
          return;
        }

        const button = candidates[index];
        const menuDoc = button.ownerDocument || doc;
        const current = getText(button);
        if (want && current && normalize(current) === wantN) {
          resolve(JSON.stringify({ success: true, mode: current, changed: false }));
          return;
        }

        clickElement(button);

        setTimeout(() => {
          const menu =
            menuDoc.querySelector('[role="menu"][data-state="open"]') ||
            menuDoc.querySelector('[role="listbox"][data-state="open"]') ||
            Array.from(menuDoc.querySelectorAll('[role="menu"], [role="listbox"]')).find(isVisible) ||
            null;

          const items = menu ? getMenuItems(menu) : [];
          inspected.push({
            button,
            current,
            items,
            score: scoreCandidate(current, items),
          });

          let match = null;
          if (want) {
            match =
              items.find((item) => item.lower === wantN) ||
              items.find((item) => item.lower.includes(wantN) || wantN.includes(item.lower)) ||
              null;
          } else {
            match = items.find((item) => normalize(item.text) !== normalize(current)) || null;
          }

          if (match) {
            clickElement(match.el);
            setTimeout(() => {
              resolve(JSON.stringify({
                success: true,
                mode: match.text,
                changed: normalize(match.text) !== normalize(current),
              }));
            }, 220);
            return;
          }

          menuDoc.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }),
          );
          setTimeout(() => nextCandidate(index + 1), 120);
        }, 320);
      };

      nextCandidate(0);
    });
  } catch (e) {
    return JSON.stringify({ success: false, error: e.message || String(e) });
  }
}
