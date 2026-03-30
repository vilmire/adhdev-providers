/**
 * Codex Extension — send_message
 *
 * Types a message into the ProseMirror input and submits it.
 */
(args = {}) => {
  try {
    const resolveDoc = () => {
      if (document.getElementById('root')) return document;
      for (const iframe of document.querySelectorAll('iframe')) {
        try {
          const innerDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (innerDoc?.getElementById('root')) return innerDoc;
        } catch (e) {}
      }
      return document;
    };
    const doc = resolveDoc();
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

    const rawMessage = findValue(args, ['message', 'MESSAGE', 'text']);
    const message = rawMessage == null || !String(rawMessage).trim()
      ? 'Write a tiny python script, include a markdown table, run `pwd` using a tool, and answer clearly.'
      : String(rawMessage);

    const editor =
      doc.querySelector('.ProseMirror[contenteditable="true"]') ||
      doc.querySelector('.ProseMirror');
    if (!editor) {
      return JSON.stringify({ sent: false, error: 'Editor not found' });
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
      return true;
    };

    const placeCaret = () => {
      editor.focus();
      const selection = doc.defaultView.getSelection();
      const range = doc.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    };

    const clearEditor = () => {
      editor.focus();
      const selection = doc.defaultView.getSelection();
      const range = doc.createRange();
      range.selectNodeContents(editor);
      selection.removeAllRanges();
      selection.addRange(range);
      try {
        doc.execCommand('delete', false, null);
      } catch (e) {}
      editor.innerHTML = '<p><br class="ProseMirror-trailingBreak"></p>';
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward', data: null }));
    };

    const insertWithExecCommand = () => {
      try {
        doc.execCommand('insertText', false, message);
        return true;
      } catch (e) {
        return false;
      }
    };

    const insertFallback = () => {
      const parts = message.split('\n');
      const frag = doc.createDocumentFragment();
      for (const part of parts) {
        const p = doc.createElement('p');
        if (part) {
          p.appendChild(doc.createTextNode(part));
        } else {
          const br = doc.createElement('br');
          br.className = 'ProseMirror-trailingBreak';
          p.appendChild(br);
        }
        frag.appendChild(p);
      }
      editor.innerHTML = '';
      editor.appendChild(frag);
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: message }));
    };

    const findSendButton = () => {
      const composerRoot =
        editor.closest('[class*="thread-composer"]') ||
        editor.closest('[class*="rounded-3xl"]') ||
        editor.parentElement ||
        doc.body;
      const buttons = Array.from(composerRoot.querySelectorAll('button')).filter((button) => {
        if (button.offsetWidth <= 0 || button.disabled) return false;
        if (button.getAttribute('aria-haspopup') === 'menu') return false;
        const aria = (button.getAttribute('aria-label') || '').trim().toLowerCase();
        const text = (button.textContent || '').trim().toLowerCase();
        if (aria.includes('new chat') || aria.includes('archive')) return false;
        if (text === 'local' || text === 'full access' || text === 'high') return false;
        return true;
      });

      return (
        buttons.find((button) => (button.getAttribute('aria-label') || '').toLowerCase().includes('send')) ||
        buttons.find((button) => (button.className || '').includes('size-token-button-composer')) ||
        buttons[buttons.length - 1] ||
        null
      );
    };

    placeCaret();
    clearEditor();
    placeCaret();

    editor.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: message,
    }));

    if (!insertWithExecCommand()) {
      insertFallback();
    }

    editor.dispatchEvent(new Event('change', { bubbles: true }));

    return new Promise((resolve) => {
      setTimeout(() => {
        const sendButton = findSendButton();
        if (sendButton) {
          clickElement(sendButton);
        }

        setTimeout(() => {
          const remainingAfterClick = (editor.textContent || '').trim();
          if (remainingAfterClick) {
            editor.focus();
            for (const type of ['keydown', 'keypress', 'keyup']) {
              editor.dispatchEvent(new KeyboardEvent(type, {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true,
              }));
            }
          }

          setTimeout(() => {
            const remaining = (editor.textContent || '').trim();
            resolve(JSON.stringify({
              sent: remaining !== message,
              method: sendButton ? 'button+enter' : 'enter',
              message: message.slice(0, 100),
              remaining,
            }));
          }, 250);
        }, 120);
      }, 120);
    });
  } catch (e) {
    return JSON.stringify({ sent: false, error: e.message || String(e) });
  }
}
