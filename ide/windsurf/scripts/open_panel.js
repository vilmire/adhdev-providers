/**
 * Windsurf v1 — open_panel
 *
 * Cascade(AI 채팅) 패널이 닫혀 있을 때 열기.
 *
 * Windsurf의 Cascade 패널은 Secondary Side Bar (#workbench.parts.auxiliarybar)에 위치.
 * 닫혀 있으면 offsetWidth === 0.
 * Cmd+L 단축키로 열 수 있음 (WINDSURF.md §2.5).
 *
 * 반환: 'visible' | 'opened' | 'error: ...'
 * 최종 확인: Windsurf 1.108.x (2026-03-10)
 */
(() => {
    try {
        // ─── 1. Cascade 패널이 이미 열려 있는지 확인 ───
        const cascade = document.querySelector('#windsurf\\.cascadePanel') ||
            document.querySelector('.chat-client-root');
        const sidebar = document.getElementById('workbench.parts.auxiliarybar');

        // 패널이 존재하고 보이면 이미 열린 상태
        if (cascade && cascade.offsetWidth > 0 && cascade.offsetHeight > 0) {
            return 'visible';
        }
        if (sidebar && sidebar.offsetWidth > 0 && sidebar.offsetHeight > 0 && cascade) {
            return 'visible';
        }

        // ─── 2. Toggle 버튼 클릭 시도 ───
        const toggleBtns = Array.from(document.querySelectorAll('li.action-item a, button, [role="button"]'));
        for (const btn of toggleBtns) {
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (label.includes('toggle cascade') || label.includes('toggle secondary') ||
                label.includes('toggle auxiliary') || label.includes('cascade')) {
                if (btn.offsetWidth > 0 || btn.offsetHeight > 0) {
                    btn.click();
                    return 'opened (toggle)';
                }
            }
        }

        // ─── 3. Cmd+L 단축키 폴백 (Windsurf 공식 단축키) ───
        // keyCode: 76, modifiers: 4 (Meta/Cmd)
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'l', code: 'KeyL', keyCode: 76,
            metaKey: true, ctrlKey: false,
            bubbles: true, cancelable: true,
        }));
        document.dispatchEvent(new KeyboardEvent('keyup', {
            key: 'l', code: 'KeyL', keyCode: 76,
            metaKey: true, ctrlKey: false,
            bubbles: true, cancelable: true,
        }));

        return 'opened (Cmd+L)';
    } catch (e) {
        return 'error: ' + e.message;
    }
})()
