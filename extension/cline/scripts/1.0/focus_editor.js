/**
 * Cline v1 — focus_editor
 *
 * Cline webview iframe 내부의 입력 필드에 포커스.
 * send_message 전에 호출하거나, 대시보드 "Focus" 버튼에 사용.
 *
 * 최종 확인: 2026-03-07
 */
(() => {
    try {
        const inner = document.querySelector('iframe');
        const doc = inner?.contentDocument || inner?.contentWindow?.document;
        if (!doc) return 'no doc';

        // data-testid 우선 → fallback
        let target = doc.querySelector('[data-testid="chat-input"]');
        if (!target) {
            const textareas = doc.querySelectorAll('textarea');
            for (const ta of textareas) {
                if (ta.offsetParent !== null && ta.offsetHeight > 20) {
                    target = ta;
                    break;
                }
            }
        }
        if (!target) {
            // contenteditable fallback
            const editables = doc.querySelectorAll('[contenteditable="true"]');
            for (const el of editables) {
                if (el.offsetParent !== null && el.offsetHeight > 10) {
                    target = el;
                    break;
                }
            }
        }
        if (!target) return 'no input';

        target.focus();
        // 커서를 끝으로 이동
        if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
            const len = (target.value || '').length;
            target.setSelectionRange(len, len);
        }
        return 'focused';
    } catch (e) {
        return 'error: ' + e.message;
    }
})()
