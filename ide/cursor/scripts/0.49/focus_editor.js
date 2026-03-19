/**
 * Cursor — focus_editor
 *
 * 채팅 입력 필드에 포커스:
 *   .aislash-editor-input[contenteditable="true"]
 */
(() => {
  try {
    const input = document.querySelector('.aislash-editor-input[contenteditable="true"]');
    if (input) { input.focus(); return 'focused'; }
    return 'not_found';
  } catch(e) { return 'error'; }
})()
