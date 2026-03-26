/**
 * Antigravity v1 — send_message
 *
 * Antigravity는 contenteditable div[role="textbox"]를 사용.
 * 여러 개의 contenteditable이 있을 수 있으므로 y좌표가 가장 큰 (메인 채팅) 것을 선택.
 *
 * ⚠️ Enter 이벤트에 composed: true + which 필수 (Shadow DOM 경계 통과 + React 호환)
 * ⚠️ keydown + keypress + keyup 전체 시퀀스 필요
 *
 * 파라미터: ${ MESSAGE }
 * 최종 확인: 2026-03-10
 */
(async () => {
    try {
        const msg = ${ MESSAGE };

        // ─── 1. 메인 채팅 입력 필드 찾기 ───
        const editors = document.querySelectorAll('[contenteditable="true"][role="textbox"]');
        if (!editors.length) return 'error: no contenteditable textbox found';

        // y좌표가 가장 큰 (화면 아래쪽 = 메인 채팅) 에디터 선택
        const editor = [...editors].reduce((a, b) =>
            b.getBoundingClientRect().y > a.getBoundingClientRect().y ? b : a
        );

        // ─── 2. 텍스트 삽입 ───
        editor.focus();

        // 기존 내용 삭제
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);

        // 텍스트 삽입
        document.execCommand('insertText', false, msg);

        // React에 변경 알림
        editor.dispatchEvent(new Event('input', { bubbles: true }));

        await new Promise(r => setTimeout(r, 300));

        // ─── 3. Enter 키 전송 (full sequence) ───
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
