/**
 * Cursor v1 — new_session
 *
 * Cursor는 workbench DOM 직접 접근.
 * "New Chat" / "New Composer" 버튼 찾기.
 *
 * 전략:
 *   1. 키보드 단축키 Ctrl+L (새 composer)
 *   2. aria-label 기반
 *   3. 텍스트 기반
 *
 * 최종 확인: 2026-03-07
 */
(() => {
    try {
        // ─── 1. aria-label 기반 ───
        const allBtns = Array.from(document.querySelectorAll('button, [role="button"], .action-item'))
            .filter(b => b.offsetWidth > 0);

        for (const btn of allBtns) {
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (label.includes('new chat') || label.includes('new composer') ||
                label.includes('new conversation') || label.includes('start new')) {
                btn.click();
                return 'clicked (aria)';
            }
        }

        // ─── 2. 텍스트 기반 ───
        for (const btn of allBtns) {
            const text = (btn.textContent || '').trim();
            if (text === '+' || text === 'New Chat' || text === 'New Composer' ||
                text === 'Start New Chat') {
                btn.click();
                return 'clicked (text)';
            }
        }

        // ─── 3. Codicon 아이콘 기반 (Cursor 스타일) ───
        for (const btn of allBtns) {
            const hasPlus = btn.querySelector('.codicon-plus, .codicon-add, [class*="plus"]');
            if (hasPlus) {
                const label = (btn.getAttribute('aria-label') || btn.getAttribute('title') || '').toLowerCase();
                if (label.includes('chat') || label.includes('composer') || label.includes('new') || label === '') {
                    btn.click();
                    return 'clicked (icon)';
                }
            }
        }

        // ─── 4. 키보드 단축키 Ctrl+L (Cursor 기본 바인딩) ───
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'l', code: 'KeyL', keyCode: 76,
            ctrlKey: true, metaKey: false,
            bubbles: true, cancelable: true,
        }));

        return 'sent Ctrl+L';
    } catch (e) {
        return 'error: ' + e.message;
    }
})()
