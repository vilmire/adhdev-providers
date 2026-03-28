/**
 * Cursor v1 — focus_editor
 *
 * CURSOR.md 4-5: Selector priority
 *   [contenteditable="true"][role="textbox"]
 *   → .chat-input textarea
 *   → .composer-input
 *   → textarea
 *
 * final Check: 2026-03-06
 */
(() => {
    const editor = document.querySelector('[contenteditable="true"][role="textbox"]')
        || document.querySelector('.chat-input textarea')
        || document.querySelector('.composer-input')
        || document.querySelector('textarea.native-input')
        || document.querySelector('textarea');
    if (editor) { editor.focus(); return 'focused'; }
    return 'no editor found';
})()
