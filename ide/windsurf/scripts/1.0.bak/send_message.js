/**
 * Windsurf v1 — send_message
 *
 * Windsurf Lexical editor ([data-lexical-editor="true"])uses.
 * contenteditable divsince it is execCommand('insertText') or InputEventallows input via.
 *
 * ⚠️ Lexicalis input event detect:
 *   - execCommand('insertText') is most stable
 *   - nativeSetter approach does not work
 *   - Uses InputEvent('insertText') as fallback
 *
 * Enter key needs KeyboardEvent full sequence (keydown + keypress + keyup).
 *
 * Parameter: ${ MESSAGE }
 * final Check: Windsurf 1.108.x (2026-03-10)
 */
(async () => {
    try {
        const msg = ${ MESSAGE };

        // ─── 1. Find Lexical editor (fallback chain) ───
        const editor =
            document.querySelector('[data-lexical-editor="true"]') ||
            document.querySelector('[contenteditable="true"][role="textbox"]') ||
            document.querySelector('.cascade-input [contenteditable="true"]') ||
            document.querySelector('.chat-input textarea') ||
            document.querySelector('textarea:not(.xterm-helper-textarea)');

        if (!editor) return 'error: no input found';

        const isTextarea = editor.tagName === 'TEXTAREA';

        if (isTextarea) {
            // ─── textarea fallback (not logged in, etc.) ───
            editor.focus();
            const proto = HTMLTextAreaElement.prototype;
            const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
            if (nativeSetter) nativeSetter.call(editor, msg);
            else editor.value = msg;

            editor.dispatchEvent(new Event('input', { bubbles: true }));
            editor.dispatchEvent(new Event('change', { bubbles: true }));

            await new Promise(r => setTimeout(r, 300));

            const enterOpts = {
                key: 'Enter', code: 'Enter',
                keyCode: 13, which: 13,
                bubbles: true, cancelable: true, composed: true,
            };
            editor.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
            editor.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
            editor.dispatchEvent(new KeyboardEvent('keyup', enterOpts));

            return 'sent';
        }

        // ─── 2. contenteditable (Lexical) editor ───
        editor.focus();

        // Select existing content and delete
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);

        // text insertion (Lexicalis execCommand('insertText')recognizes)
        document.execCommand('insertText', false, msg);

        // React/Lexicalnotify changes to
        editor.dispatchEvent(new Event('input', { bubbles: true }));

        await new Promise(r => setTimeout(r, 300));

        // ─── 3. Enter key sending (full sequence) ───
        const enterOpts = {
            key: 'Enter', code: 'Enter',
            keyCode: 13, which: 13,
            bubbles: true, cancelable: true, composed: true,
        };
        editor.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
        editor.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
        editor.dispatchEvent(new KeyboardEvent('keyup', enterOpts));

        return 'sent';
    } catch (e) {
        return 'error: ' + e.message;
    }
})()
