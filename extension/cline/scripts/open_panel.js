/**
 * Cline v1 — open_panel
 *
 * 패널 상태 확인 및 열기 시도.
 *
 * iframe 컨텍스트에서는 VS Code API 접근이 제한적이므로,
 * 패널이 숨겨져 있을 때는 'panel_hidden' 상태를 반환.
 * → bridge extension의 ensureAgentPanelOpen() 또는
 *   agent_stream_focus 메시지를 통해 열어야 함.
 *
 * 반환: 'visible' | 'panel_hidden'
 * 최종 확인: 2026-03-07
 */
(() => {
    try {
        const inner = document.querySelector('iframe');
        const doc = inner?.contentDocument || inner?.contentWindow?.document;
        if (!doc) return 'panel_hidden';

        const root = doc.getElementById('root');
        if (root && root.offsetHeight > 0) return 'visible';

        return 'panel_hidden';
    } catch (e) { return 'error: ' + e.message; }
})()
