/**
 * Codex Extension — send_message
 *
 * Types a message into the ProseMirror input and submits it.
 * Uses InputEvent dispatch for ProseMirror compatibility.
 *
 * Placeholder: ${MESSAGE}
 */
(() => {
  try {
    const message = ${MESSAGE};
    
    // Find ProseMirror editor
    const editor = document.querySelector('.ProseMirror');
    if (!editor) return JSON.stringify({ error: 'ProseMirror editor not found' });

    // Focus the editor
    editor.focus();

    // Clear existing content
    const existingP = editor.querySelector('p');
    if (existingP) {
      existingP.textContent = message;
      // Dispatch input event for ProseMirror to detect the change
      editor.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: message,
      }));
    } else {
      // Fallback: create new paragraph
      const p = document.createElement('p');
      p.textContent = message;
      editor.innerHTML = '';
      editor.appendChild(p);
      editor.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: message,
      }));
    }

    // Wait a tick then submit via Enter key
    setTimeout(() => {
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
      });
      editor.dispatchEvent(enterEvent);
    }, 100);

    return JSON.stringify({ success: true, message: message.substring(0, 100) });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e) });
  }
})()
