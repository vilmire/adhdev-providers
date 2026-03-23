/**
 * Windsurf v1 — focus_editor
 * 
 * Cascade(채팅) 입력창에 포커스를 맞춥니다.
 * Windsurf는 VS Code 포크로, 채팅 UI를 "Cascade"라고 부릅니다.
 * 
 * DOM 구조:
 *   #windsurf.cascadePanel → .chat-client-root
 *   입력: [contenteditable="true"][role="textbox"]
 *         또는 textarea (미로그인)
 * 
 * 최종 확인: Windsurf (2026-03-06)
 */
(() => {
    try {
        const editor =
            document.querySelector('[contenteditable="true"][role="textbox"]') ||
            document.querySelector('[data-lexical-editor="true"]') ||
            document.querySelector('.chat-input textarea') ||
            document.querySelector('.cascade-input [contenteditable="true"]') ||
            document.querySelector('textarea:not(.xterm-helper-textarea)');
        if (editor) {
            editor.focus();
            return true;
        }
        return false;
    } catch (e) {
        return false;
    }
})()
