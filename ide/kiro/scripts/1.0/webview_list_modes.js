/**
 * Kiro — webview_list_modes
 * Maps the Autopilot toggle to modes "Autopilot" and "Manual".
 */
(() => {
    try {
        const toggle = document.querySelector('#autonomy-mode-toggle-switch');
        if (!toggle) {
            // Fallback for older versions or if UI changed
            return JSON.stringify({ modes: ['Default'], current: 'Default' });
        }

        const isAutopilot = toggle.checked;

        return JSON.stringify({ 
            modes: ['Autopilot', 'Manual'], 
            current: isAutopilot ? 'Autopilot' : 'Manual' 
        });
    } catch (e) {
        return JSON.stringify({ modes: [], current: '', error: e.message });
    }
})()
