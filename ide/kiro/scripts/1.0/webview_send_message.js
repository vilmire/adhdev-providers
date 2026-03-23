/**
 * Kiro — webview_send_message (webview iframe 내부에서 실행)
 *
 * Kiro의 채팅 입력은 webview iframe 안의 ProseMirror/tiptap 에디터.
 * execCommand('insertText') + Enter 키 이벤트로 메시지 전송.
 *
 * 파라미터: ${ MESSAGE }
 */
(async () => {
    try {
        const msg = ${ MESSAGE };

        // ─── 1. 입력 필드 찾기 ───
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

        // 전체 선택 + 삭제 + 삽입
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

        // ─── 3. Enter 키 전송 ───
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
