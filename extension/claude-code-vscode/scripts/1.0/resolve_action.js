/**
 * Claude Code — resolve_action (Cline 패턴: button + vscode-button)
 * scripts.js 가 ${ ACTION} 을 JSON 문자열로 치환함.
 */
(() => {
  try {
    function resolveDoc() {
      let doc = document;
      if (doc.getElementById('root')) {
        const inner = doc.querySelector('iframe');
        if (inner) {
          try {
            const d = inner.contentDocument || inner.contentWindow?.document;
            if (d?.getElementById('root')) return d;
          } catch (e) {}
        }
        return doc;
      }
      for (const iframe of doc.querySelectorAll('iframe')) {
        try {
          const innerDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (!innerDoc) continue;
          if (innerDoc.getElementById('root')) return innerDoc;
          for (const inner2 of innerDoc.querySelectorAll('iframe')) {
            try {
              const d2 = inner2.contentDocument || inner2.contentWindow?.document;
              if (d2?.getElementById('root')) return d2;
            } catch (e2) {}
          }
          if (innerDoc.body) return innerDoc;
        } catch (e) {}
      }
      return doc;
    }

    const doc = resolveDoc();
    const action = ${ ACTION };
    const approvePatterns = ['proceed', 'approve', 'allow', 'accept', 'save', 'run', 'yes', 'confirm', 'continue'];
    const rejectPatterns = ['reject', 'deny', 'cancel', 'no', 'skip', 'dismiss'];
    const patterns = action === 'approve' ? approvePatterns : rejectPatterns;

    const allBtns = [
      ...Array.from(doc.querySelectorAll('button')),
      ...Array.from(doc.querySelectorAll('vscode-button')),
    ].filter((b) => b.offsetWidth > 0 && b.offsetHeight > 0);

    for (const btn of allBtns) {
      const tid = (btn.getAttribute('data-testid') || '').toLowerCase();
      if (action === 'approve' && /approve|accept|allow|run|primary|continue/i.test(tid)) {
        btn.click();
        return true;
      }
      if (action === 'reject' && /reject|deny|cancel|secondary|dismiss/i.test(tid)) {
        btn.click();
        return true;
      }
    }

    for (const btn of allBtns) {
      const text = (btn.textContent || '').trim().toLowerCase();
      if (!text || text.length > 48) continue;
      if (patterns.some((p) => text === p || text.startsWith(p) || text.includes(p))) {
        btn.click();
        return true;
      }
    }

    for (const btn of allBtns) {
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      if (patterns.some((p) => label.includes(p))) {
        btn.click();
        return true;
      }
    }

    return false;
  } catch (e) {
    return false;
  }
})();
