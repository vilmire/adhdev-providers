/**
 * Trae — open_panel
 *
 * Trae AI chat panel open.
 * "TRAE" button or ⌘L via shortcut open.
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

 // 2. "TRAE" button click 
        const toggleBtns = Array.from(document.querySelectorAll('li.action-item a, button, [role="button"]'));
        for (const btn of toggleBtns) {
            const label = (btn.getAttribute('aria-label') || '');
            if (label === 'TRAE' || label.toLowerCase().includes('toggle secondary') ||
                label.toLowerCase().includes('toggle auxiliary')) {
                btn.click();
                return 'opened (toggle)';
            }
        }

        // 3. Cmd+L shortcut fallback (Trae default shortcut)
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'l', code: 'KeyL', keyCode: 76,
            metaKey: true, ctrlKey: false,
            bubbles: true, cancelable: true,
        }));
        document.dispatchEvent(new KeyboardEvent('keyup', {
            key: 'l', code: 'KeyL', keyCode: 76,
            metaKey: true, ctrlKey: false,
            bubbles: true, cancelable: true,
        }));

        return 'opened (⌘L)';
    } catch (e) {
        return 'error: ' + e.message;
    }
})()
