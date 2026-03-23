/**
 * Kiro — send_message
 *
 * Kiro의 채팅 입력은 webview iframe 안에 있어 메인 DOM에서 직접 접근 불가.
 * auxbar 하단의 입력 필드 좌표를 계산하여 clickCoords로 반환.
 * 데몬이 CDP Input API로 해당 좌표에 클릭+타이핑+Enter를 수행.
 *
 * 파라미터: ${ MESSAGE }
 */
(() => {
    try {
        const auxbar = document.getElementById('workbench.parts.auxiliarybar');
        if (!auxbar || auxbar.offsetWidth === 0) {
            return JSON.stringify({ sent: false, error: 'auxbar not found' });
        }

        const rect = auxbar.getBoundingClientRect();
        const x = Math.round(rect.x + rect.width / 2);
        const y = Math.round(rect.y + rect.height - 80);

        return JSON.stringify({
            sent: false,
            needsTypeAndSend: true,
            clickCoords: { x, y },
        });
    } catch (e) {
        return JSON.stringify({ sent: false, error: e.message });
    }
})()
