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
(() => {
    try {
        // ─── 1. aria-label 기반 ───
        const allBtns = Array.from(document.querySelectorAll('button, [role="button"], .action-item'))
            .filter(b => b.offsetWidth > 0);

        for (const btn of allBtns) {
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (label.includes('new chat') || label.includes('new cascade') ||
                label.includes('new conversation') || label.includes('start new') ||
                label.includes('new session')) {
                btn.click();
                return 'clicked (aria)';
            }
        }

        // ─── 2. 텍스트 기반 ───
        for (const btn of allBtns) {
            const text = (btn.textContent || '').trim();
            if (text === '+' || text === 'New Chat' || text === 'New Cascade' ||
                text === 'Start New Chat' || text === 'New Session') {
                btn.click();
                return 'clicked (text)';
            }
        }

        // ─── 3. Codicon 아이콘(+) 기반 ───
        for (const btn of allBtns) {
            const hasPlus = btn.querySelector('.codicon-plus, .codicon-add, [class*="plus"]');
            if (hasPlus) {
                const label = (btn.getAttribute('aria-label') || btn.getAttribute('title') || '').toLowerCase();
                // Cascade 관련 컨텍스트이거나 라벨이 비어있으면 새 세션 버튼일 가능성
                if (label.includes('chat') || label.includes('cascade') ||
                    label.includes('new') || label === '') {
                    btn.click();
                    return 'clicked (icon)';
                }
            }
        }

        // ─── 4. Cmd+L 단축키 (macOS: metaKey, Windows/Linux: ctrlKey) ───
        // Windsurf에서 Cmd+L은 Cascade 패널 토글/새 세션 생성
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'l', code: 'KeyL', keyCode: 76,
            metaKey: true, ctrlKey: false,
            bubbles: true, cancelable: true,
        }));

        return 'sent Cmd+L';
    } catch (e) {
        return 'error: ' + e.message;
    }
})()
