/**
 * Trae — list_chats
 *
 * Trae from main DOM / Session list get.
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

 // list history button Check
        return JSON.stringify({ sessions });
    } catch (e) {
        return JSON.stringify({ error: e.message, sessions: [] });
    }
})()
