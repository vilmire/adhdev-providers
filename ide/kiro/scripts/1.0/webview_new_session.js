/**
 * Kiro — webview_new_session (webview iframe 내부에서 실행)
 *
 * "New Session" 버튼/탭 클릭.
 * Kiro는 탭 바에 + 버튼 또는 "New Session" 액션이 있음.
 */
(() => {
    try {
        // kiro-icon-button (+ 버튼) 찾기
        const addBtns = document.querySelectorAll('.kiro-icon-button, button, [role="button"]');
        for (const btn of addBtns) {
            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
            const title = (btn.getAttribute('title') || '').toLowerCase();
            if (ariaLabel.includes('new') || title.includes('new') ||
                ariaLabel.includes('add') || title.includes('add')) {
                btn.click();
                return JSON.stringify({ created: true, method: 'button' });
            }
        }

        // Checkpoint > New Session 영역 찾기
        const allText = document.querySelectorAll('*');
        for (const el of allText) {
            if (el.children.length === 0 && (el.textContent || '').trim() === 'New Session') {
                el.click();
                return JSON.stringify({ created: true, method: 'text-click' });
            }
        }

        return JSON.stringify({ created: false, error: 'New Session button not found' });
    } catch (e) {
        return JSON.stringify({ created: false, error: e.message });
    }
})()
