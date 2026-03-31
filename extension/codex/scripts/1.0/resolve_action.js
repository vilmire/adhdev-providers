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

    const allBtns = Array.from(approvalArea.querySelectorAll('button'))
      .filter(b => b.offsetWidth > 0 && !b.disabled);

    if (allBtns.length === 0) {
      return JSON.stringify({ resolved: false, error: 'no buttons in approval area' });
    }

    const normalize = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');

    // ─── 1. Match by exact buttonText ───
    if (buttonText) {
      const wantN = normalize(buttonText);
      const exact = allBtns.find(b => normalize(b.textContent) === wantN);
      if (exact) {
        exact.click();
        return JSON.stringify({ resolved: true, clicked: (exact.textContent || '').trim() });
      }
      // Partial match
      const partial = allBtns.find(b => normalize(b.textContent).includes(wantN) || wantN.includes(normalize(b.textContent)));
      if (partial) {
        partial.click();
        return JSON.stringify({ resolved: true, clicked: (partial.textContent || '').trim() });
      }
    }

    // ─── 2. Match by action using pattern lists ───
    const patterns = action === 'approve' ? approvePatterns : action === 'reject' ? rejectPatterns : [];
    if (patterns.length > 0) {
      for (const btn of allBtns) {
        const text = normalize(btn.textContent);
        if (text.length === 0 || text.length > 60) continue;
        if (patterns.some(p => text === p || text.startsWith(p) || text.includes(p))) {
          btn.click();
          return JSON.stringify({ resolved: true, clicked: (btn.textContent || '').trim() });
        }
      }
      // aria-label fallback
      for (const btn of allBtns) {
        const label = normalize(btn.getAttribute('aria-label') || '');
        if (patterns.some(p => label.includes(p))) {
          btn.click();
          return JSON.stringify({ resolved: true, clicked: label });
        }
      }
    }

    // ─── 3. Numeric option matching (e.g. action='1' or action='2') ───
    const numMatch = String(action).match(/^(\d+)\.?$/);
    if (numMatch) {
      const num = numMatch[1];
      const numBtn = allBtns.find(b => {
        const t = normalize(b.textContent);
        return t.startsWith(num + '.') || t === num;
      });
      if (numBtn) {
        numBtn.click();
        return JSON.stringify({ resolved: true, clicked: (numBtn.textContent || '').trim() });
      }
    }

    const available = allBtns.map(b => (b.textContent || '').trim()).filter(Boolean);
    return JSON.stringify({ resolved: false, error: 'button not found', available });
  } catch (e) {
    return JSON.stringify({ resolved: false, error: e.message || String(e) });
  }
}
