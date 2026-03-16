/**
 * Trae — list_chats
 *
 * Trae 메인 DOM에서 탭 / 세션 목록 가져오기.
 */
(() => {
    try {
        const tabs = document.querySelectorAll('.chat-tab-header, [class*="tab-item"], [class*="TabItem"]');
        if (tabs.length === 0) return JSON.stringify({ sessions: [] });

        const sessions = Array.from(tabs).map((tab, i) => {
            const title = (tab.textContent || '').replace('✕', '').trim();
            const active = tab.classList.contains('active') ||
                           tab.getAttribute('aria-selected') === 'true' ||
                           (tab.className || '').toLowerCase().includes('active');
            return { id: String(i), title, active };
        });

        // 탭 목록이 보이지 않으면 사이드바의 히스토리 버튼 확인
        return JSON.stringify({ sessions });
    } catch (e) {
        return JSON.stringify({ error: e.message, sessions: [] });
    }
})()
