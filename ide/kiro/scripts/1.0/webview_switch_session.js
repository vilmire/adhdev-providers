/**
 * Kiro — webview_switch_session (webview iframe 내부에서 실행)
 *
 * 세션 탭 클릭으로 전환.
 * 파라미터: ${ SESSION_ID } (탭 인덱스)
 */
(() => {
    try {
        const targetId = ${ SESSION_ID };
        const tabs = document.querySelectorAll('.kiro-tabs-item');
        const idx = parseInt(targetId, 10);

        if (isNaN(idx) || idx < 0 || idx >= tabs.length) {
            return JSON.stringify({ switched: false, error: `Invalid session index: ${targetId}, total: ${tabs.length}` });
        }

        tabs[idx].click();
        const label = tabs[idx].querySelector('.kiro-tabs-item-label');
        return JSON.stringify({
            switched: true,
            title: (label?.textContent || tabs[idx].textContent || '').trim(),
        });
    } catch (e) {
        return JSON.stringify({ switched: false, error: e.message });
    }
})()
