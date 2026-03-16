/**
 * Cursor v1 — open_panel
 *
 * Cursor Agent 패널이 숨겨져 있을 때 패널 열기.
 * Cursor 워크벤치 페이지에서 실행 (type=page, workbench URL)
 *
 * 반환: 'visible' | 'opened' | 'error: ...'
 * 최종 확인: 2026-03-07
 */
(() => {
    try {
        // Cursor Agent 패널 확인
        const sidebar = document.getElementById('workbench.parts.auxiliarybar') ||
            document.getElementById('workbench.parts.unifiedsidebar');
        if (sidebar && sidebar.offsetWidth > 0 && sidebar.offsetHeight > 0) {
            return 'visible';
        }

        // Toggle 버튼 클릭
        const toggleBtns = Array.from(document.querySelectorAll('li.action-item a'));
        for (const btn of toggleBtns) {
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (label.includes('toggle agents') || label.includes('toggle primary')) {
                btn.click();
                return 'opened (toggle)';
            }
        }

        return 'error: no toggle button found';
    } catch (e) { return 'error: ' + e.message; }
})()
