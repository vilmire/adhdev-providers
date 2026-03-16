/**
 * Cline v1 — send_message
 *
 * 구조:
 *   1. outer webview → inner iframe의 contentDocument 접근
 *   2. data-testid="chat-input" textarea에 값 설정 (React controlled)
 *   3. React Fiber에서 onSend 함수 찾아 직접 호출 (가장 확실한 방법)
 *   4. Fallback: data-testid="send-button" 클릭 or Enter 키
 *
 * ⚠️ Cline의 send-button은 DIV 태그이며, 일반 click 이벤트로는 React가
 *    전송을 처리하지 않음. Fiber onSend()를 직접 호출해야 정확하게 동작.
 *
 * 최종 확인: 2026-03-07
 */
(async () => {
    try {
        const inner = document.querySelector('iframe');
        const doc = inner?.contentDocument || inner?.contentWindow?.document;
        if (!doc) return 'error: no doc';

        // ─── 1. 입력 필드 찾기 ───
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
        if (!target) return 'error: no chat-input';

        // ─── 2. React controlled input 값 설정 ───
        const proto = inner.contentWindow?.HTMLTextAreaElement?.prototype
            || HTMLTextAreaElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

        if (nativeSetter) {
            nativeSetter.call(target, ${ MESSAGE });
        } else {
            target.value = ${ MESSAGE };
        }

        // React 이벤트 트리거
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));

        // React setState 반영 대기
        await new Promise(r => setTimeout(r, 300));

        // ─── 3. Fiber onSend 직접 호출 (최우선) ───
        const allEls = doc.querySelectorAll('*');
        for (const el of allEls) {
            const fk = Object.keys(el).find(k => k.startsWith('__reactFiber'));
            if (!fk) continue;
            let fiber = el[fk];
            for (let d = 0; d < 15 && fiber; d++) {
                const props = fiber.memoizedProps || fiber.pendingProps;
                if (props && typeof props.onSend === 'function') {
                    props.onSend();
                    return 'sent';
                }
                fiber = fiber.return;
            }
        }

        // ─── 4. Fallback: send-button 클릭 ───
        const sendBtn = doc.querySelector('[data-testid="send-button"]');
        if (sendBtn) {
            try {
                const rect = sendBtn.getBoundingClientRect();
                const opts = {
                    bubbles: true, cancelable: true, view: inner.contentWindow,
                    clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2
                };
                sendBtn.dispatchEvent(new MouseEvent('mousedown', opts));
                sendBtn.dispatchEvent(new MouseEvent('mouseup', opts));
                sendBtn.dispatchEvent(new MouseEvent('click', opts));
                return 'sent';
            } catch (e) { }
        }

        // ─── 5. 최후 Fallback: Enter 키 ───
        target.focus();
        target.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', keyCode: 13,
            bubbles: true, cancelable: true,
        }));

        return 'sent';
    } catch (e) {
        return 'error: ' + e.message;
    }
})()
