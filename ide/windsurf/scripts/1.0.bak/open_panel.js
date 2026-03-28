/**
 * Windsurf v1 — open_panel
 *
 * Cascade(AI chat) If panel is closed when present open.
 *
 * WindsurfCascade panel of is Secondary Side Bar (#workbench.parts.auxiliarybar)located at.
 * closed offsetWidth === 0.
 * Cmd+L via shortcut can be opened (WINDSURF.md §2.5).
 *
 * Return: 'visible' | 'opened' | 'error: ...'
 * final Check: Windsurf 1.108.x (2026-03-10)
 */
(() => {
    try {
        // ─── 1. Check if Cascade panel is already open ───
        const cascade = document.querySelector('#windsurf\\.cascadePanel') ||
            document.querySelector('.chat-client-root');
        const sidebar = document.getElementById('workbench.parts.auxiliarybar');

        // panelexists and visible means already open
        if (cascade && cascade.offsetWidth > 0 && cascade.offsetHeight > 0) {
            return 'visible';
        }
        if (sidebar && sidebar.offsetWidth > 0 && sidebar.offsetHeight > 0 && cascade) {
            return 'visible';
        }

        // ─── 2. Attempt to click toggle button ───
        const toggleBtns = Array.from(document.querySelectorAll('li.action-item a, button, [role="button"]'));
        for (const btn of toggleBtns) {
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (label.includes('toggle cascade') || label.includes('toggle secondary') ||
                label.includes('toggle auxiliary') || label.includes('cascade')) {
                if (btn.offsetWidth > 0 || btn.offsetHeight > 0) {
                    btn.click();
                    return 'opened (toggle)';
                }
            }
        }

        // ─── 3. Cmd+L shortcut fallback (Windsurf official shortcut) ───
        // keyCode: 76, modifiers: 4 (Meta/Cmd)
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

        return 'opened (Cmd+L)';
    } catch (e) {
        return 'error: ' + e.message;
    }
})()
