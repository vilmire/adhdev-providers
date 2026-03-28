/**
 * Kiro — webview_new_session (webview iframe runs inside)
 *
 * "New Session" button/ click.
 * Kiro + button or "New Session" .
 */
(() => {
    try {
        // kiro-icon-button (+ button) search
        const addBtns = document.querySelectorAll('.kiro-icon-button, button, [role="button"]');
        for (const btn of addBtns) {
            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
            const title = (btn.getAttribute('title') || '').toLowerCase();
            if (ariaLabel.includes('new') || title.includes('new') ||
                ariaLabel.includes('add') || title.includes('add')) {
                btn.click();
                return JSON.stringify({ created: true, method: 'button' });
            }
        }

        // Checkpoint > New Session area search
        const allText = document.querySelectorAll('*');
        for (const el of allText) {
            if (el.children.length === 0 && (el.textContent || '').trim() === 'New Session') {
                el.click();
                return JSON.stringify({ created: true, method: 'text-click' });
            }
        }

        return JSON.stringify({ created: false, error: 'New Session button not found' });
    } catch (e) {
        return JSON.stringify({ created: false, error: e.message });
    }
})()
