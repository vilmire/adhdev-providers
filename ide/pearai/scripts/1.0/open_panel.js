/**
 * PearAI — open_panel
 */
(() => {
    try {
        const sidebar = document.getElementById('workbench.parts.auxiliarybar');
        if (sidebar && sidebar.offsetWidth > 0 && sidebar.offsetHeight > 0) {
            return JSON.stringify({ opened: true, visible: true });
        }

        const toggle = Array.from(document.querySelectorAll('a[aria-label], button[aria-label], [role="button"][aria-label]'))
            .find((element) => /toggle pearai side bar|toggle pearai|toggle auxiliary/i.test(element.getAttribute('aria-label') || ''));

        if (!toggle) {
            return JSON.stringify({ opened: false, error: 'toggle not found' });
        }

        toggle.click();
        return JSON.stringify({ opened: true });
    } catch (error) {
        return JSON.stringify({ opened: false, error: String(error && error.message || error) });
    }
})()
