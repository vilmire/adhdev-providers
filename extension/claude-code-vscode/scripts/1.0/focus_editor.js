/**
 * Claude Code — focus_editor (Cline + Antigravity: 실제 입력 위젯 포커스)
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
          if (innerDoc.querySelector('.ProseMirror, textarea, [contenteditable="true"]')) return innerDoc;
        } catch (e) {}
      }
      return doc;
    }

    const doc = resolveDoc();
    let target =
      doc.querySelector('.ProseMirror[contenteditable="true"]') ||
      doc.querySelector('.ProseMirror') ||
      doc.querySelector('[data-testid="chat-input"]');

    if (!target) {
      const tas = doc.querySelectorAll('textarea');
      for (const ta of tas) {
        if (ta.offsetParent !== null && ta.offsetHeight > 16) {
          target = ta;
          break;
        }
      }
    }
    if (!target) {
      const eds = doc.querySelectorAll('[contenteditable="true"]');
      let best = null;
      let bestY = -1e9;
      for (const el of eds) {
        if (!el.offsetParent) continue;
        const y = el.getBoundingClientRect().y;
        if (y > bestY) {
          bestY = y;
          best = el;
        }
      }
      target = best;
    }

    if (!target) return 'no input';
    target.focus();
    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
      const len = (target.value || '').length;
      target.setSelectionRange(len, len);
    }
    return 'focused';
  } catch (e) {
    return 'error: ' + e.message;
  }
})();
