/**
 * Claude Code (VS Code) — send_message
 *
 * Antigravity send_message: 하단 contenteditable + insertText + Enter 풀 시퀀스
 * Codex send_message: ProseMirror 정리 후 insertText / innerHTML 폴백
 */
(async () => {
  try {
    const msg = ${ MESSAGE };

    function resolveDoc() {
      let doc = document;
      if (doc.getElementById('root')) {
        for (const iframe of document.querySelectorAll('iframe')) {
          try {
            const d = iframe.contentDocument || iframe.contentWindow?.document;
            if (d?.getElementById('root')) return d;
          } catch (e) {}
        }
      }
      for (const iframe of document.querySelectorAll('iframe')) {
        try {
          const d = iframe.contentDocument || iframe.contentWindow?.document;
          if (d?.querySelector('.ProseMirror, [contenteditable="true"], textarea')) return d;
        } catch (e) {}
      }
      return document;
    }

    const doc = resolveDoc();
    const clickSend = () => {
      const send =
        doc.querySelector('[data-testid="send-button"], [aria-label*="send" i], button[title*="Send" i]') ||
        Array.from(doc.querySelectorAll('button')).find((b) => /^send$/i.test((b.textContent || '').trim()));
      if (send && send.offsetParent) {
        send.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return true;
      }
      return false;
    };

    let editor =
      doc.querySelector('.ProseMirror[contenteditable="true"]') ||
      doc.querySelector('.ProseMirror');

    if (!editor) {
      const editors = doc.querySelectorAll('[contenteditable="true"][role="textbox"]');
      if (editors.length) {
        editor = [...editors].reduce((a, b) =>
          b.getBoundingClientRect().y > a.getBoundingClientRect().y ? b : a
        );
      }
    }

    if (!editor) {
      const ta = doc.querySelector('textarea');
      if (ta && ta.offsetParent) {
        const proto = ta.ownerDocument.defaultView?.HTMLTextAreaElement?.prototype || HTMLTextAreaElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (nativeSetter) nativeSetter.call(ta, msg);
        else ta.value = msg;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
        ta.focus();
        await new Promise((r) => setTimeout(r, 200));
        ta.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
          })
        );
        return 'sent';
      }
      return 'error: no editor';
    }

    editor.focus();
    try {
      doc.execCommand('selectAll', false, null);
      doc.execCommand('delete', false, null);
    } catch (e) {}

    let inserted = false;
    try {
      inserted = doc.execCommand('insertText', false, msg);
    } catch (e) {}
    if (!inserted) {
      editor.textContent = msg;
    }
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: msg }));

    await new Promise((r) => setTimeout(r, 280));

    const enterOpts = {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
      composed: true,
    };
    editor.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
    editor.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
    editor.dispatchEvent(new KeyboardEvent('keyup', enterOpts));

    if (!clickSend()) {
      /* Enter-only path often enough */
    }

    return 'sent';
  } catch (e) {
    return 'error: ' + e.message;
  }
})();
