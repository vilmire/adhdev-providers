/**
 * Trae — send_message
 *
 * Trae는 .chat-input-v2-input-box-editable (contenteditable / Lexical) 사용.
 * Lexical의 내부 state를 올바르게 업데이트하기 위해 Selection API + execCommand 사용.
 *
 * 파라미터: ${ MESSAGE }
 */
(async () => {
    try {
        const msg = ${ MESSAGE };

        // ─── 1. 입력 필드 찾기 ───
        const editor =
            document.querySelector('.chat-input-v2-input-box-editable') ||
            document.querySelector('[contenteditable="true"][role="textbox"]') ||
            document.querySelector('[data-lexical-editor="true"]');

        if (!editor) return JSON.stringify({ sent: false, error: 'no input found' });

        // ─── 2. 포커스 + 전체 선택 + 삭제 + 삽입 ───
        editor.focus();
        await new Promise(r => setTimeout(r, 100));

        // Selection API로 전체 선택
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editor);
        sel.removeAllRanges();
        sel.addRange(range);
        await new Promise(r => setTimeout(r, 50));

        // 삭제 후 삽입 (Lexical state 동기화)
        document.execCommand('delete', false, null);
        await new Promise(r => setTimeout(r, 50));
        document.execCommand('insertText', false, msg);
        
        // Input 이벤트
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 500));

        // ─── 3. send 버튼 클릭 ───
        const sendBtn = document.querySelector('.chat-input-v2-send-button');
        if (sendBtn && !sendBtn.disabled) {
            sendBtn.click();
            return JSON.stringify({ sent: true, method: 'button' });
        }

        // 버튼이 아직 disabled이면 Enter 키 시도
        const enterOpts = {
            key: 'Enter', code: 'Enter',
            keyCode: 13, which: 13,
            bubbles: true, cancelable: true, composed: true,
        };
        editor.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
        await new Promise(r => setTimeout(r, 50));
        editor.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
        editor.dispatchEvent(new KeyboardEvent('keyup', enterOpts));

        // 여전히 안 되면 needsTypeAndSend 폴백
        return JSON.stringify({
            sent: false,
            needsTypeAndSend: true,
            selector: '.chat-input-v2-input-box-editable',
        });
    } catch (e) {
        return JSON.stringify({ sent: false, error: e.message });
    }
})()
