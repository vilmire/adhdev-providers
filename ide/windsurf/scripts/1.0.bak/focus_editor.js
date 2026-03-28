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
