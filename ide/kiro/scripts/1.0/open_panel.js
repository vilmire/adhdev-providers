/**
 * Kiro — open_panel
 *
 * Kiro AI chat panel open.
 * Secondary Side Bar (#workbench.parts.auxiliarybar)located at.
 * "Toggle Secondary Side Bar (⌥⌘B)" or "Kiro" via button open.
 *
 * Return: 'visible' | 'opened' | 'error: ...'
 */
(() => {
    try {
        // 1. if already open Check
        const sidebar = document.getElementById('workbench.parts.auxiliarybar');
        if (sidebar && sidebar.offsetWidth > 0 && sidebar.offsetHeight > 0) {
            return 'visible';
        }

        // 2. Attempt to click toggle button
        const toggleBtns = Array.from(document.querySelectorAll('li.action-item a, button, [role="button"]'));
        for (const btn of toggleBtns) {
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (label.includes('toggle secondary') || label.includes('toggle auxiliary') ||
                label === 'kiro' || label.includes('kiro')) {
                if (btn.offsetWidth > 0 || btn.offsetHeight > 0) {
                    btn.click();
                    return 'opened (toggle)';
                }
            }
        }

        // 3. Cmd+Shift+I shortcut fallback (Kiro default shortcut)
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'b', code: 'KeyB', keyCode: 66,
            metaKey: true, altKey: true, ctrlKey: false,
            bubbles: true, cancelable: true,
        }));
        document.dispatchEvent(new KeyboardEvent('keyup', {
            key: 'b', code: 'KeyB', keyCode: 66,
            metaKey: true, altKey: true, ctrlKey: false,
            bubbles: true, cancelable: true,
        }));

        return 'opened (⌥⌘B)';
    } catch (e) {
        return 'error: ' + e.message;
    }
})()
