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
    const rawMessage =
      typeof args?.message === 'string' ? args.message :
      typeof args?.MESSAGE === 'string' ? args.MESSAGE :
      typeof args?.text === 'string' ? args.text :
      '';
    const message = String(rawMessage || '');
    if (!message.trim()) {
      return JSON.stringify({ sent: false, error: 'message required' });
    }

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

    const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const getTurnCount = () => doc.querySelectorAll('[data-content-search-turn-key]').length;
    const getMatchingUserTurnCount = () => {
      const target = normalizeText(message);
      if (!target) return 0;
      return Array.from(doc.querySelectorAll('[data-content-search-unit-key]')).filter((unit) => {
        const unitKey = unit.getAttribute('data-content-search-unit-key') || '';
        const role = unitKey.split(':').pop()?.toLowerCase() || '';
        if (role !== 'user' && role !== 'human') return false;
        return normalizeText(unit.textContent || '').includes(target);
      }).length;
    };
    const isComposerBusy = () => {
      const button = findSendButton();
      if (!button) return false;
      const aria = (button.getAttribute('aria-label') || '').trim().toLowerCase();
      const svg = button.querySelector('svg');
      return button.disabled || aria.includes('stop') || svg?.getAttribute('fill') === 'currentColor';
    };
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    placeCaret();
    clearEditor();
    placeCaret();

    const initialTurnCount = getTurnCount();
    const initialUserTurnMatches = getMatchingUserTurnCount();

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
          const remainingAfterClick = normalizeText(editor.textContent || '');
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

          (async () => {
            let evidence = null;
            for (let i = 0; i < 30; i += 1) {
              await wait(100);
              const remaining = normalizeText(editor.textContent || '');
              const turnCount = getTurnCount();
              const matchingUserTurns = getMatchingUserTurnCount();
              const busy = isComposerBusy();
              const cleared = !remaining;
              if (busy || cleared || turnCount > initialTurnCount || matchingUserTurns > initialUserTurnMatches) {
                evidence = {
                  remaining,
                  cleared,
                  busy,
                  turnCount,
                  matchingUserTurns,
                };
                break;
              }
            }

            const finalRemaining = normalizeText(editor.textContent || '');
            resolve(JSON.stringify({
              sent: !!evidence,
              method: sendButton ? 'button+enter' : 'enter',
              message: message.slice(0, 100),
              remaining: finalRemaining,
              cleared: evidence?.cleared || !finalRemaining,
              busy: evidence?.busy || false,
              turnCount: evidence?.turnCount ?? getTurnCount(),
              matchingUserTurns: evidence?.matchingUserTurns ?? getMatchingUserTurnCount(),
              initialTurnCount,
              initialUserTurnMatches,
              error: evidence ? undefined : 'submit not confirmed',
            }));
          })();
        }, 120);
      }, 120);
    });
  } catch (e) {
    return JSON.stringify({ sent: false, error: e.message || String(e) });
  }
}
