/**
 * Windsurf v1 — focus_editor
 * 
 * Cascade(chat) focus on input field.
 * Windsurf VS Code fork, chat UI "Cascade"is called.
 * 
 * DOM structure:
 *   #windsurf.cascadePanel → .chat-client-root
 *   input: [contenteditable="true"][role="textbox"]
 * or textarea ()
 * 
 * final Check: Windsurf (2026-03-06)
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
