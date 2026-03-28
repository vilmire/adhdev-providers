/**
 * Windsurf v1 — new_session
 *
 * new Cascade session start.
 *
 * strategy:
 *   1. Search for "New" button based on aria-label
 *   2. text-based button search
 *   3. Codicon icon(+) based search
 *   4. Cmd+L shortcut fallback (Windsurffrom new Cascade open)
 *
 * Windsurffrom Cascadeis an AI chat panel,
 * "New Chat" or "+" starts New session via button.
 *
 * final Check: Windsurf 1.108.x (2026-03-10)
 */
(() => {
    try {
        // ─── 1. Based on aria-label ───
        const allBtns = Array.from(document.querySelectorAll('button, [role="button"], .action-item'))
            .filter(b => b.offsetWidth > 0);

        for (const btn of allBtns) {
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (label.includes('new chat') || label.includes('new cascade') ||
                label.includes('new conversation') || label.includes('start new') ||
                label.includes('new session')) {
                btn.click();
                return 'clicked (aria)';
            }
        }

        // ─── 2. text-based ───
        for (const btn of allBtns) {
            const text = (btn.textContent || '').trim();
            if (text === '+' || text === 'New Chat' || text === 'New Cascade' ||
                text === 'Start New Chat' || text === 'New Session') {
                btn.click();
                return 'clicked (text)';
            }
        }

        // ─── 3. Codicon icon(+) based ───
        for (const btn of allBtns) {
            const hasPlus = btn.querySelector('.codicon-plus, .codicon-add, [class*="plus"]');
            if (hasPlus) {
                const label = (btn.getAttribute('aria-label') || btn.getAttribute('title') || '').toLowerCase();
 // Cascade-related context or empty label New session button 
                if (label.includes('chat') || label.includes('cascade') ||
                    label.includes('new') || label === '') {
                    btn.click();
                    return 'clicked (icon)';
                }
            }
        }

 // ─── 4. Cmd+L (macOS: metaKey, Windows/Linux: ctrlKey) ───
        // Windsurffrom Cmd+Lis Cascade Toggle panel/New session create
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'l', code: 'KeyL', keyCode: 76,
            metaKey: true, ctrlKey: false,
            bubbles: true, cancelable: true,
        }));

        return 'sent Cmd+L';
    } catch (e) {
        return 'error: ' + e.message;
    }
})()
