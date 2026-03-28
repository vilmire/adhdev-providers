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
(async () => {
    try {
        const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        const isOpen = () => {
            const cascade = document.querySelector('#windsurf\\.cascadePanel') || document.querySelector('.chat-client-root');
            return !!(cascade && cascade.offsetWidth > 0 && cascade.offsetHeight > 0);
        };

        if (isOpen()) {
            return JSON.stringify({ opened: true });
        }

        const toggles = Array.from(document.querySelectorAll('a[role="checkbox"], a[role="button"], button, [role="button"]'))
            .filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);

        const toggle = toggles.find(el => {
            const label = ((el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '')).toLowerCase();
            return label.includes('cascade') || label.includes('toggle cascade') || label.includes('toggle auxiliary') || label.includes('toggle secondary');
        });

        if (toggle) {
            toggle.click();
            await wait(250);
            if (isOpen()) {
                return JSON.stringify({ opened: true });
            }
        }

        const fireShortcut = (metaKey, ctrlKey) => {
            const down = new KeyboardEvent('keydown', {
                key: 'l', code: 'KeyL', keyCode: 76, which: 76,
                metaKey, ctrlKey,
                bubbles: true, cancelable: true,
            });
            const up = new KeyboardEvent('keyup', {
                key: 'l', code: 'KeyL', keyCode: 76, which: 76,
                metaKey, ctrlKey,
                bubbles: true, cancelable: true,
            });
            document.dispatchEvent(down);
            document.dispatchEvent(up);
        };

        fireShortcut(true, false);
        await wait(250);
        if (!isOpen()) {
            fireShortcut(false, true);
            await wait(250);
        }

        return JSON.stringify({ opened: isOpen() });
    } catch (e) {
        return JSON.stringify({ opened: false, error: e.message });
    }
})()
