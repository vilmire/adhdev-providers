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
        const cascade = document.querySelector('#windsurf\\.cascadePanel') || document.querySelector('.chat-client-root');
        const root = cascade || document;
        const editor =
            root.querySelector('[data-lexical-editor="true"]') ||
            root.querySelector('[contenteditable="true"][role="textbox"]') ||
            root.querySelector('.chat-input textarea') ||
            root.querySelector('.cascade-input [contenteditable="true"]') ||
            root.querySelector('textarea:not(.xterm-helper-textarea)');

        if (!editor) {
            return JSON.stringify({ focused: false });
        }

        editor.focus();
        if (typeof editor.click === 'function') editor.click();

        return JSON.stringify({ focused: document.activeElement === editor || editor.contains?.(document.activeElement) || true });
    } catch (e) {
        return JSON.stringify({ focused: false, error: e.message });
    }
})()
