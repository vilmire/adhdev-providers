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
    if (!editor) return JSON.stringify({ error: 'Editor not found' });

    // Focus the editor
    editor.focus();

    // Use execCommand to safely insert text. This avoids TrustedHTML errors 
    // and naturally triggers ProseMirror's state updates and Keyboard/Input events.
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, message);

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

    return JSON.stringify({ sent: true, success: true, message: message.substring(0, 100) });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e) });
  }
})()
