(async () => {
  try {
    const frame = document.getElementById('active-frame');
    const doc = frame?.contentDocument || frame?.contentWindow?.document || document;
    const view = doc.defaultView || window;
    const message = ${ MESSAGE };
    if (!String(message || '').trim()) {
      return JSON.stringify({ sent: false, error: 'message required' });
    }

    const input = doc.querySelector('[role="textbox"].messageInput_cKsPxg');
    const sendButton = doc.querySelector('button.sendButton_gGYT1w');
    if (!input || !sendButton) {
      return JSON.stringify({ sent: false, error: 'input or send button not found' });
    }

    input.focus();

    const selection = view.getSelection();
    const range = doc.createRange();
    range.selectNodeContents(input);
    selection.removeAllRanges();
    selection.addRange(range);
    try {
      doc.execCommand('delete', false);
    } catch {}
    input.dispatchEvent(new view.InputEvent('input', {
      bubbles: true,
      inputType: 'deleteContentBackward',
      data: null,
    }));

    const endRange = doc.createRange();
    endRange.selectNodeContents(input);
    endRange.collapse(false);
    selection.removeAllRanges();
    selection.addRange(endRange);

    let inserted = false;
    try {
      inserted = doc.execCommand('insertText', false, message);
    } catch {}
    if (!inserted) {
      input.textContent = message;
    }

    input.dispatchEvent(new view.InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: message,
    }));
    input.dispatchEvent(new view.InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: message,
    }));
    input.dispatchEvent(new view.Event('change', { bubbles: true }));

    await new Promise((resolve) => setTimeout(resolve, 80));

    if (sendButton.disabled) {
      return JSON.stringify({
        sent: false,
        error: 'send button stayed disabled',
        text: input.textContent || '',
      });
    }

    const rect = sendButton.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    sendButton.dispatchEvent(new view.PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
    sendButton.dispatchEvent(new view.MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
    sendButton.dispatchEvent(new view.PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
    sendButton.dispatchEvent(new view.MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
    sendButton.dispatchEvent(new view.MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
    if (typeof sendButton.click === 'function') sendButton.click();

    return JSON.stringify({ sent: true, submitted: true });
  } catch (e) {
    return JSON.stringify({ sent: false, error: e.message || String(e) });
  }
})();
