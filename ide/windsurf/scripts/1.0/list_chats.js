/**
 * Windsurf v1 — list_chats
 * 
 * Cascade get tab list.
 * If panel is closed open first and wait until tab is rendered.
 * cascade-tab-{uuid} element React Fiberfrom title extract.
 * 
 * final Check: Windsurf 1.108.x (2026-03-10)
 */
(async () => {
    try {
        const tabs = Array.from(document.querySelectorAll('[id^="cascade-tab-"]')).filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);
        const sessions = tabs.map((tab, index) => ({
            id: tab.id.replace(/^cascade-tab-/, ''),
            title: (tab.textContent || '').replace(/\s+/g, ' ').trim() || `Chat ${index + 1}`,
            active: /bg-ide-tab-active-background-color/.test(tab.innerHTML || ''),
            index,
        }));
        return JSON.stringify({ sessions });
    } catch (e) {
        return JSON.stringify({ sessions: [], error: e.message });
    }
})()
