/**
 * PearAI — focus_editor
 */
(() => {
    const editor = document.querySelector('textarea[placeholder*="Type your task" i]')
        || document.querySelector('textarea')
        || document.querySelector('.chat-text-area textarea')
        || document.querySelector('[contenteditable="true"]');

    if (!editor) return 'no editor found';

    editor.scrollIntoView({ block: 'center' });
    editor.focus();
    editor.click?.();
    return 'focused';
})()
