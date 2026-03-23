/**
 * PearAI — list_sessions (IDE 메인 프레임에서 실행)
 * 
 * 히스토리 패널 토글 버튼을 클릭하여 히스토리 뷰를 오픈합니다.
 * 히스토리 뷰가 열리면 webviewListSessions로 항목을 읽을 수 있습니다.
 */
(() => {
    try {
        // Panel title bar에서 히스토리 관련 버튼 찾기
        const actionBtns = document.querySelectorAll('.action-item a.action-label, .action-item .action-label');
        for (const btn of actionBtns) {
            const title = (btn.getAttribute('title') || '').toLowerCase();
            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
            const cls = btn.className || '';
            
            if (title.includes('history') || title.includes('히스토리') ||
                ariaLabel.includes('history') || ariaLabel.includes('히스토리') ||
                cls.includes('codicon-history')) {
                btn.click();
                return JSON.stringify({ toggled: true, method: 'panelAction', title: btn.getAttribute('title') });
            }
        }

        // Broader search
        const allBtns = document.querySelectorAll('a[title], button[title]');
        for (const btn of allBtns) {
            const title = (btn.getAttribute('title') || '').toLowerCase();
            if (title.includes('history') || title.includes('task history')) {
                btn.click();
                return JSON.stringify({ toggled: true, method: 'titleBtn', title: btn.getAttribute('title') });
            }
        }

        return JSON.stringify({ toggled: false, error: 'History toggle button not found' });
    } catch (e) {
        return JSON.stringify({ toggled: false, error: e.message });
    }
})()
