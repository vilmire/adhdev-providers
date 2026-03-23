/**
 * Windsurf v1 — send_message
 *
 * Windsurf는 Lexical 에디터 ([data-lexical-editor="true"])를 사용합니다.
 * contenteditable div이므로 execCommand('insertText') 또는 InputEvent로 입력 가능.
 *
 * ⚠️ Lexical은 입력 이벤트를 정밀하게 감지하므로:
 *   - execCommand('insertText')가 가장 안정적
 *   - nativeSetter 방식은 동작하지 않음
 *   - InputEvent('insertText')를 폴백으로 사용
 *
 * Enter 키는 KeyboardEvent 전체 시퀀스 필요 (keydown + keypress + keyup).
 *
 * 파라미터: ${ MESSAGE }
 * 최종 확인: Windsurf 1.108.x (2026-03-10)
 */
(async () => {
    try {
        const msg = ${ MESSAGE };

        // ─── 1. Lexical 에디터 찾기 (폴백 체인) ───
        const editor =
            document.querySelector('[data-lexical-editor="true"]') ||
            document.querySelector('[contenteditable="true"][role="textbox"]') ||
            document.querySelector('.cascade-input [contenteditable="true"]') ||
            document.querySelector('.chat-input textarea') ||
            document.querySelector('textarea:not(.xterm-helper-textarea)');

        if (!editor) return 'error: no input found';

        const isTextarea = editor.tagName === 'TEXTAREA';

        if (isTextarea) {
            // ─── textarea 폴백 (미로그인 등) ───
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

        // ─── 2. contenteditable (Lexical) 에디터 ───
        editor.focus();

        // 기존 내용 선택 후 삭제
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);

        // 텍스트 삽입 (Lexical은 execCommand('insertText')를 인식)
        document.execCommand('insertText', false, msg);

        // React/Lexical에 변경 알림
        editor.dispatchEvent(new Event('input', { bubbles: true }));

        await new Promise(r => setTimeout(r, 300));

        // ─── 3. Enter 키 전송 (전체 시퀀스) ───
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
