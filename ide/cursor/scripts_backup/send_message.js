/**
 * Cursor v1 — send_message
 *
 * Cursor는 workbench DOM에 직접 접근 (iframe 없음).
 * 입력: [contenteditable="true"][role="textbox"] 또는 textarea.native-input
 *
 * ⚠️ React controlled 입력이므로 nativeSetter + input 이벤트 트리거 필수.
 * ⚠️ CDP에서 setTimeout은 미실행 → async/await 사용.
 *
 * 파라미터: ${ MESSAGE }
 * 최종 확인: 2026-03-10
 */
(async () => {
    try {
        const msg = ${ MESSAGE };

        // ─── 1. 입력 필드 찾기 ───
        // Cursor Agent mode: contenteditable div
        let editor = document.querySelector('.composer-view:not([style*="display: none"]) [contenteditable="true"][role="textbox"]')
            || document.querySelector('[contenteditable="true"][role="textbox"]');

        if (editor) {
            // contenteditable에 값 설정
            editor.focus();

            // 기존 내용 선택 후 삭제
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);

            // 텍스트 삽입
            document.execCommand('insertText', false, msg);

            // React에 변경 알림
            editor.dispatchEvent(new Event('input', { bubbles: true }));
            editor.dispatchEvent(new Event('change', { bubbles: true }));

            await new Promise(r => setTimeout(r, 300));

            // Enter 키로 전송 (full sequence + composed for Shadow DOM)
            const enterOpts = {
                key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
                bubbles: true, cancelable: true, composed: true,
            };
            editor.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
            editor.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
            editor.dispatchEvent(new KeyboardEvent('keyup', enterOpts));

            return 'sent';
        }

        // ─── 2. textarea fallback ───
        let textarea = document.querySelector('.composer-view textarea.native-input')
            || document.querySelector('textarea.native-input')
            || document.querySelector('.chat-input textarea')
            || document.querySelector('.composer-input textarea');

        if (textarea) {
            textarea.focus();

            const proto = HTMLTextAreaElement.prototype;
            const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

            if (nativeSetter) nativeSetter.call(textarea, msg);
            else textarea.value = msg;

            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));

            await new Promise(r => setTimeout(r, 300));

            const enterOpts2 = {
                key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
                bubbles: true, cancelable: true, composed: true,
            };
            textarea.dispatchEvent(new KeyboardEvent('keydown', enterOpts2));
            textarea.dispatchEvent(new KeyboardEvent('keypress', enterOpts2));
            textarea.dispatchEvent(new KeyboardEvent('keyup', enterOpts2));

            return 'sent';
        }

        return 'error: no input found';
    } catch (e) {
        return 'error: ' + e.message;
    }
})()
