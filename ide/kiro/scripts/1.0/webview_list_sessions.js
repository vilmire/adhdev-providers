/**
 * Kiro — webview_list_sessions (webview iframe runs inside)
 *
 * Kiro session list Return.
 * DOM: .kiro-tabs-item
 */
(() => {
    try {
        const tabs = document.querySelectorAll('.kiro-tabs-item');
        const sessions = Array.from(tabs).map((tab, i) => {
            const label = tab.querySelector('.kiro-tabs-item-label');
            const title = (label?.textContent || tab.textContent || '').trim();
            const active = tab.classList.contains('active') ||
                           tab.getAttribute('aria-selected') === 'true';
            return { id: String(i), title, active };
        });
        return JSON.stringify({ sessions });
    } catch (e) {
        return JSON.stringify({ sessions: [], error: e.message });
    }
})()
