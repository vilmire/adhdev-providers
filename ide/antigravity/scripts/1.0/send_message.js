/**
 * Antigravity v1 — send_message
 *
 * Antigravity contenteditable div[role="textbox"] use.
 * Multiple contenteditablemay exist, so select the one with largest y coordinate (main chat).
 *
 * ⚠️ Enter event composed: true + which (Shadow DOM crossing boundary + React compatibility)
 * ⚠️ keydown + keypress + keyup full sequence needed
 *
 * Parameter: ${ MESSAGE }
 * final Check: 2026-03-10
 */
(async () => {
    try {
        const msg = ${ MESSAGE };

        // ─── 1. Find main chat input field ───
        const editors = document.querySelectorAll('[contenteditable="true"][role="textbox"]');
        if (!editors.length) return 'error: no contenteditable textbox found';

 // y (bottom of screen = chat) editor Select
        const editor = [...editors].reduce((a, b) =>
            b.getBoundingClientRect().y > a.getBoundingClientRect().y ? b : a
        );

        // ─── 2. text insertion ───
        editor.focus();

 // content delete
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);

        // text insertion
        document.execCommand('insertText', false, msg);

        // Reactnotify changes to
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
