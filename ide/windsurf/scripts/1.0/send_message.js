/**
 * Windsurf v1 — send_message
 */
(async (params) => {
    try {
        const selector = '[id="windsurf.cascadePanel"] [contenteditable="true"]';
        const input = document.querySelector(selector) || document.querySelector('[contenteditable="true"]');
        if (!input) {
            return JSON.stringify({ sent: false, error: 'Input not found' });
        }
        input.focus();
        return JSON.stringify({
            sent: false,
            needsTypeAndSend: true,
            selector
        });
    } catch(e) {
        return JSON.stringify({ sent: false, error: e.message });
    }
})
