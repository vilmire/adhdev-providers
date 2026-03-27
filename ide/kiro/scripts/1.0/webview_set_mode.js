/**
 * Kiro — webview_set_mode
 * Toggles the Autopilot switch based on requested mode.
 * 파라미터: ${ MODE }
 */
(() => {
    try {
        const mode = ${ MODE };
        if (!mode) return JSON.stringify({ success: false, error: 'No mode specified' });

        const toggle = document.querySelector('#autonomy-mode-toggle-switch');
        if (!toggle) {
            return JSON.stringify({ success: false, error: 'Autonomy toggle not found' });
        }

        const isAutopilot = toggle.checked;

        const wantAutopilot = mode.toLowerCase() === 'autopilot';
        const wantManual = mode.toLowerCase() === 'manual';

        if (wantAutopilot && !isAutopilot) {
            toggle.click();
            return JSON.stringify({ success: true });
        } else if (wantManual && isAutopilot) {
            toggle.click();
            return JSON.stringify({ success: true });
        }

        // Already in the right mode
        return JSON.stringify({ success: true });
    } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
    }
})()
