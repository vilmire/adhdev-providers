/**
 * Kiro — send_message
 *
 * Kiro chat input is inside webview iframe, so direct access from main DOM is not possible.
 * auxbar at the bottom of Input field calculate coordinates and return as clickCoords.
 * CDP Input API click++Enter row.
 *
 * Parameter: ${ MESSAGE }
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
