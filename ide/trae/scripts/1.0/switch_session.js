/**
 * Trae — switch_session
 *
 * Trae Switch session tab.
 * Parameter: ${ SESSION_ID }
 */
(() => {
    try {
        const targetId = ${ SESSION_ID };
        const tabs = document.querySelectorAll('.chat-tab-header, [class*="tab-item"], [class*="TabItem"]');
        const idx = parseInt(targetId, 10);

        if (isNaN(idx) || idx < 0 || idx >= tabs.length) {
            return JSON.stringify({ switched: false, error: `invalid index: ${targetId}` });
        }

        tabs[idx].click();
        const title = (tabs[idx].textContent || '').replace('✕', '').trim();
        return JSON.stringify({ switched: true, title });
    } catch (e) {
        return JSON.stringify({ switched: false, error: e.message });
    }
})()
