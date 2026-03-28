/**
 * Cursor — focus_editor
 *
 * Focus chat input field:
 *   .aislash-editor-input[contenteditable="true"]
 */
(() => {
  try {
    const input = document.querySelector('.aislash-editor-input[contenteditable="true"]');
    if (input) { input.focus(); return JSON.stringify({ focused: true }); }
    return JSON.stringify({ focused: false, error: 'Input not found' });
  } catch(e) { return JSON.stringify({ focused: false, error: e.message }); }
})()
