/**
 * Kiro — webview_send_message (webview iframe runs inside)
 *
 * Kiro chat input webview iframe ProseMirror/tiptap editor.
 * execCommand('insertText') + Enter via key event Send message.
 *
 * Parameter: ${ MESSAGE }
 */
(async () => {
    try {
        const msg = ${ MESSAGE };

        // ─── 1. Find input field ───
        const editor =
            document.querySelector('.tiptap.ProseMirror') ||
            document.querySelector('[contenteditable="true"]') ||
            document.querySelector('textarea');

        if (!editor) return JSON.stringify({ sent: false, error: 'no input found in webview' });

        const isTextarea = editor.tagName === 'TEXTAREA';

        if (isTextarea) {
            editor.focus();
            const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
            if (nativeSetter) nativeSetter.call(editor, msg);
            else editor.value = msg;
            editor.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise(r => setTimeout(r, 300));

            const enterOpts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true };
            editor.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
            editor.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
            editor.dispatchEvent(new KeyboardEvent('keyup', enterOpts));
            return JSON.stringify({ sent: true });
        }

        // ─── 2. contenteditable (ProseMirror / tiptap) ───
        editor.focus();
        await new Promise(r => setTimeout(r, 100));

        // all Select + delete + insert
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editor);
        sel.removeAllRanges();
        sel.addRange(range);
        await new Promise(r => setTimeout(r, 50));

        document.execCommand('delete', false, null);
        await new Promise(r => setTimeout(r, 50));
        document.execCommand('insertText', false, msg);

        editor.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 400));

 // ─── 3. button click (Enter ) ───
        const sendBtns = Array.from(document.querySelectorAll('button, div[role="button"], span[role="button"]'))
            .filter(b => {
                const aria = (b.getAttribute('aria-label') || '').toLowerCase();
                const title = (b.getAttribute('title') || '').toLowerCase();
                const text = (b.textContent || '').toLowerCase();
                const className = (b.className || '').toLowerCase();
                return aria.includes('send') || aria.includes('submit') || 
                       title.includes('send') || title.includes('submit') ||
                       className.includes('send') || className.includes('submit') ||
                       b.querySelector('svg'); // Fallback for icon-only buttons next to input
            });

        // Find the button closest to the editor
        let submitBtn = null;
        if (sendBtns.length > 0) {
            // grab the one visually right/bottom to the editor, or just the last svg button
            submitBtn = sendBtns[sendBtns.length - 1]; 
            submitBtn.click();
            await new Promise(r => setTimeout(r, 100));
        }

        // ─── 4. Enter key sending (Fallback) ───
        const enterOpts = {
            key: 'Enter', code: 'Enter',
            keyCode: 13, which: 13,
            bubbles: true, cancelable: true, composed: true,
        };
        editor.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
        await new Promise(r => setTimeout(r, 50));
        editor.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
        editor.dispatchEvent(new KeyboardEvent('keyup', enterOpts));

        return JSON.stringify({ sent: true });
    } catch (e) {
        return JSON.stringify({ sent: false, error: e.message });
    }
})()
