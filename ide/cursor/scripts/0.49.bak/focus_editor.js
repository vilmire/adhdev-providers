/**
 * Cursor — focus_editor
 *
 * 채팅 입력 필드에 포커스:
 *   .aislash-editor-input[contenteditable="true"]
 */
(() => {
  try {
    const input = document.querySelector('.aislash-editor-input[contenteditable="true"]');
    if (input) { input.focus(); return JSON.stringify({ focused: true }); }
    return JSON.stringify({ focused: false, error: 'Input not found' });
  } catch(e) { return JSON.stringify({ focused: false, error: e.message }); }
})()
