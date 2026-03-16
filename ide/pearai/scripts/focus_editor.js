/**
 * Cursor v1 — focus_editor
 *
 * CURSOR.md 4-5: 셀렉터 우선순위
 *   [contenteditable="true"][role="textbox"]
 *   → .chat-input textarea
 *   → .composer-input
 *   → textarea
 *
 * 최종 확인: 2026-03-06
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
