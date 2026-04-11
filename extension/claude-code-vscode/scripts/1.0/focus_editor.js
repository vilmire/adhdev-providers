/**
 * Claude Code — focus_editor (Cline + Antigravity: 실제 입력 위젯 포커스)
 */
(() => {
  try {
    function resolveDoc() {
      for (const iframe of document.querySelectorAll('iframe')) {
        try {
          const d = iframe.contentDocument || iframe.contentWindow?.document;
          if (d?.querySelector('.ProseMirror, textarea, [contenteditable="true"]')) return d;
        } catch (e) {}
      }
      return document;
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
