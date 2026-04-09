(args = {}) => {
  try {
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

    const action = findValue(args, ['action', 'ACTION']) || 'approve';
    const buttonText = findValue(args, ['buttonText', 'button', 'BUTTON_TEXT', 'BUTTON']) || '';

    const approvePatterns = ['proceed', 'approve', 'allow', 'accept', 'save', 'run', 'yes', 'confirm', 'resume', 'submit'];
    const rejectPatterns = ['reject', 'deny', 'cancel', 'no', 'skip'];

    // ─── Locate the approval area (same strategy as read_chat.js) ───
    const searchDocs = [document];
    // Try inner iframe too
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        const innerDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (innerDoc) searchDocs.push(innerDoc);
      } catch (e) {}
    }

    let approvalArea = null;
    for (const d of searchDocs) {
      // Find request-input-panel
      let requestPanel = d.querySelector('[class*="request-input-panel"]');
      if (!requestPanel) {
        const tas = d.querySelectorAll('textarea');
        for (const ta of tas) {
          if (ta.className && ta.className.includes('request-input-panel')) {
            requestPanel = ta;
            break;
          }
        }
      }
      if (requestPanel) {
        let p = requestPanel;
        for (let i = 0; i < 12 && p && p.parentElement; i++) {
          p = p.parentElement;
          const btns = p.querySelectorAll('button').length;
          if (btns >= 4) {
            approvalArea = p;
            break;
          }
        }
      }
      if (approvalArea) break;
    }

    if (!approvalArea) {
      return JSON.stringify({ resolved: false, error: 'no approval area found' });
    }

    const clickElement = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
      if (typeof el.click === 'function') el.click();
      return true;
    };

    const isVisible = (el) => !!el && el.offsetWidth > 0 && el.offsetHeight > 0 && !el.closest('[inert]');
    const allBtns = Array.from(approvalArea.querySelectorAll('button'))
      .filter(b => isVisible(b) && !b.disabled);

    if (allBtns.length === 0) {
      return JSON.stringify({ resolved: false, error: 'no buttons in approval area' });
    }

    const normalize = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const optionNodes = Array.from(approvalArea.querySelectorAll('[role="radio"], [role="option"], [aria-checked], div, li'))
      .filter((el) => {
        if (!isVisible(el)) return false;
        if (el.tagName.toLowerCase() === 'button') return false;
        const text = normalize(el.textContent);
        if (!text || text.length > 180) return false;
        return /^\d+\./.test(text) || /^\d+\s/.test(text);
      })
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);

    const submitButton = allBtns
      .slice()
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        if (ar.top !== br.top) return ar.top - br.top;
        return ar.left - br.left;
      })
      .find((btn) => {
        const text = normalize(btn.textContent);
        const aria = normalize(btn.getAttribute('aria-label') || '');
        return !/skip|cancel|reject|deny|no/.test(text) && !/skip|cancel|reject|deny|no/.test(aria);
      }) || allBtns[allBtns.length - 1];

    const skipLikeButton = allBtns.find((btn) => {
      const text = normalize(btn.textContent);
      const aria = normalize(btn.getAttribute('aria-label') || '');
      return /skip|cancel|reject|deny|no/.test(text) || /skip|cancel|reject|deny|no/.test(aria);
    }) || null;

    const clickOptionThenSubmit = (optionNode) => {
      clickElement(optionNode);
      if (submitButton && submitButton !== optionNode) clickElement(submitButton);
      return JSON.stringify({
        resolved: true,
        clicked: normalize(optionNode.textContent),
        submittedWith: normalize(submitButton?.textContent || submitButton?.getAttribute?.('aria-label') || ''),
      });
    };

    // ─── 1. Match by exact buttonText ───
    if (buttonText) {
      const wantN = normalize(buttonText);
      const exact = allBtns.find(b => normalize(b.textContent) === wantN);
      if (exact) {
        clickElement(exact);
        return JSON.stringify({ resolved: true, clicked: (exact.textContent || '').trim() });
      }
      // Partial match
      const partial = allBtns.find(b => normalize(b.textContent).includes(wantN) || wantN.includes(normalize(b.textContent)));
      if (partial) {
        clickElement(partial);
        return JSON.stringify({ resolved: true, clicked: (partial.textContent || '').trim() });
      }

      const exactOption = optionNodes.find(node => normalize(node.textContent) === wantN);
      if (exactOption) {
        return clickOptionThenSubmit(exactOption);
      }

      const partialOption = optionNodes.find(node => {
        const text = normalize(node.textContent);
        return text.includes(wantN) || wantN.includes(text);
      });
      if (partialOption) {
        return clickOptionThenSubmit(partialOption);
      }
    }

    // ─── 2. Match by action using pattern lists ───
    const patterns = action === 'approve' ? approvePatterns : action === 'reject' ? rejectPatterns : [];
    if (patterns.length > 0) {
      for (const btn of allBtns) {
        const text = normalize(btn.textContent);
        if (text.length === 0 || text.length > 60) continue;
        if (patterns.some(p => text === p || text.startsWith(p) || text.includes(p))) {
          clickElement(btn);
          return JSON.stringify({ resolved: true, clicked: (btn.textContent || '').trim() });
        }
      }
      // aria-label fallback
      for (const btn of allBtns) {
        const label = normalize(btn.getAttribute('aria-label') || '');
        if (patterns.some(p => label.includes(p))) {
          clickElement(btn);
          return JSON.stringify({ resolved: true, clicked: label });
        }
      }

      if (action === 'approve' && optionNodes.length > 0) {
        return clickOptionThenSubmit(optionNodes[0]);
      }
      if (action === 'reject') {
        if (skipLikeButton) {
          clickElement(skipLikeButton);
          return JSON.stringify({ resolved: true, clicked: (skipLikeButton.textContent || '').trim() || 'skip' });
        }
        if (optionNodes.length > 0) {
          return clickOptionThenSubmit(optionNodes[optionNodes.length - 1]);
        }
      }
    }

    // ─── 3. Numeric option matching (e.g. action='1' or action='2') ───
    const numMatch = String(action).match(/^(\d+)\.?$/);
    if (numMatch) {
      const num = numMatch[1];
      const numOption = optionNodes.find(node => {
        const t = normalize(node.textContent);
        return t.startsWith(num + '.') || t === num;
      });
      if (numOption) {
        return clickOptionThenSubmit(numOption);
      }
    }

    const available = [
      ...optionNodes.map(node => (node.textContent || '').trim()).filter(Boolean),
      ...allBtns.map(b => (b.textContent || '').trim() || (b.getAttribute('aria-label') || '').trim()).filter(Boolean),
    ];
    return JSON.stringify({ resolved: false, error: 'button not found', available });
  } catch (e) {
    return JSON.stringify({ resolved: false, error: e.message || String(e) });
  }
}
