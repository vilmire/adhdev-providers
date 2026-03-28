/**
 * Cursor — send_message
 *
 * Cursor uses cdp-type-and-send approach:
 *   1. Verify input field exists
 *   2. Returns needsTypeAndSend: true → daemon handles typing + Enter via CDP
 *
 * Input selector: .aislash-editor-input[contenteditable="true"]
 * Parameter: ${ MESSAGE } (Not used — daemon handles typing directly)
 */
(() => {
  try {
    const input = document.querySelector('.aislash-editor-input[contenteditable="true"]');
    if (!input) return JSON.stringify({ sent: false, error: 'Input box not found' });
    return JSON.stringify({
      sent: false,
      needsTypeAndSend: true,
      selector: '.aislash-editor-input[contenteditable="true"]',
    });
  } catch(e) {
    return JSON.stringify({ sent: false, error: e.message });
  }
})()
