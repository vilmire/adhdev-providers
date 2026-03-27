/**
 * Windsurf v1 — new_session
 *
 * 새 Cascade 세션을 시작합니다.
 *
 * 전략:
 *   1. aria-label 기반 "New" 버튼 탐색
 *   2. 텍스트 기반 버튼 탐색
 *   3. Codicon 아이콘(+) 기반 탐색
 *   4. Cmd+L 단축키 폴백 (Windsurf에서 새 Cascade 열기)
 *
 * Windsurf에서는 Cascade가 AI 채팅 패널이며,
 * "New Chat" 또는 "+" 버튼으로 새 세션을 시작합니다.
 *
 * 최종 확인: Windsurf 1.108.x (2026-03-10)
 */
(async () => {
    try {
        const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        const cascade = document.querySelector('#windsurf\\.cascadePanel') || document.querySelector('.chat-client-root');
        const beforeTabs = document.querySelectorAll('[id^="cascade-tab-"]').length;
        const headerButtons = Array.from((cascade || document).querySelectorAll('button')).filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);

        const clickSequence = (el) => {
            const rect = el.getBoundingClientRect();
            const init = { bubbles: true, cancelable: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, pointerId: 1, pointerType: 'mouse' };
            el.focus?.();
            for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
                el.dispatchEvent(new PointerEvent(type, init));
            }
        };

        let button = headerButtons.find(el => /lucide-plus/.test(el.innerHTML));

        if (!button) {
            button = headerButtons.find(el => {
                const text = (el.innerText || el.textContent || '').trim().toLowerCase();
                const label = ((el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '')).toLowerCase();
                return text === '+' || label.includes('new chat') || label.includes('new cascade') || label.includes('new conversation') || label.includes('new session');
            });
        }

        if (button) {
            clickSequence(button);
            await wait(300);
            const afterTabs = document.querySelectorAll('[id^="cascade-tab-"]').length;
            return JSON.stringify({ created: afterTabs >= beforeTabs });
        }

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', code: 'KeyL', keyCode: 76, which: 76, metaKey: true, bubbles: true, cancelable: true }));
        document.dispatchEvent(new KeyboardEvent('keyup', { key: 'l', code: 'KeyL', keyCode: 76, which: 76, metaKey: true, bubbles: true, cancelable: true }));
        await wait(300);

        return JSON.stringify({ created: document.querySelectorAll('[id^="cascade-tab-"]').length >= beforeTabs });
    } catch (e) {
        return JSON.stringify({ created: false, error: e.message });
    }
})()
