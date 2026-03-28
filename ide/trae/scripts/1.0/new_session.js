/**
 * Trae — new_session
 *
 * "New Task" create (⌃⌘N shortcut or button click).
 * Trae from main DOM accessible.
 */
(() => {
    try {
        // button search
        const buttons = document.querySelectorAll('button, [role="button"], .action-item a');
        for (const btn of buttons) {
            const text = (btn.textContent || '').trim();
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (text.includes('New Task') || label.includes('new task') || label.includes('new chat')) {
                btn.click();
                return JSON.stringify({ created: true, method: 'button' });
            }
        }

        // shortcut fallback: ⌃⌘N
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'n', code: 'KeyN', keyCode: 78,
            metaKey: true, ctrlKey: true,
            bubbles: true, cancelable: true,
        }));
        return JSON.stringify({ created: true, method: 'shortcut' });
    } catch (e) {
        return JSON.stringify({ created: false, error: e.message });
    }
})()
