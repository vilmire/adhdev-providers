/**
 * Trae — send_message
 *
 * Trae .chat-input-v2-input-box-editable (contenteditable / Lexical) use.
 * Lexical inside state to correctly update Selection API + execCommand use.
 *
 * Parameter: ${ MESSAGE }
 */
(async () => {
    try {
        const msg = ${ MESSAGE };

        // ─── 1. Find input field ───
        const editor =
            document.querySelector('.chat-input-v2-input-box-editable') ||
            document.querySelector('[contenteditable="true"][role="textbox"]') ||
            document.querySelector('[data-lexical-editor="true"]');

        if (!editor) return JSON.stringify({ sent: false, error: 'no input found' });

        // ─── 2. focus + all Select + delete + insert ───
        editor.focus();
        await new Promise(r => setTimeout(r, 100));

 // Selection API all Select
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editor);
        sel.removeAllRanges();
        sel.addRange(range);
        await new Promise(r => setTimeout(r, 50));

        // Delete and insert (sync Lexical state)
        document.execCommand('delete', false, null);
        await new Promise(r => setTimeout(r, 50));
        document.execCommand('insertText', false, msg);
        
        // Input event
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 500));

        // ─── 3. send button click ───
        const sendBtn = document.querySelector('.chat-input-v2-send-button');
        if (sendBtn && !sendBtn.disabled) {
            sendBtn.click();
            return JSON.stringify({ sent: true, method: 'button' });
        }

 // button If still disabled, try Enter key
        const enterOpts = {
            key: 'Enter', code: 'Enter',
            keyCode: 13, which: 13,
            bubbles: true, cancelable: true, composed: true,
        };
        editor.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
        await new Promise(r => setTimeout(r, 50));
        editor.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
        editor.dispatchEvent(new KeyboardEvent('keyup', enterOpts));

        // If still fails needsTypeAndSend fallback
        return JSON.stringify({
            sent: false,
            needsTypeAndSend: true,
            selector: '.chat-input-v2-input-box-editable',
        });
    } catch (e) {
        return JSON.stringify({ sent: false, error: e.message });
    }
})()
