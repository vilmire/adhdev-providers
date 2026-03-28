/**
 * Windsurf v1 — list_chats
 * 
 * Cascade get tab list.
 * If panel is closed open first and wait until tab is rendered.
 * cascade-tab-{uuid} element React Fiberfrom title extract.
 * 
 * final Check: Windsurf 1.108.x (2026-03-10)
 */
(async () => {
    try {
 // ─── 1. If panel is closed open ───
        let tabs = document.querySelectorAll('[id^="cascade-tab-"]');
        if (tabs.length === 0) {
            // Check if Cascade panel is visible Check
            const cascade = document.querySelector('#windsurf\\.cascadePanel') ||
                document.querySelector('.chat-client-root');
            const sidebar = document.getElementById('workbench.parts.auxiliarybar');
            const panelVisible = (cascade && cascade.offsetWidth > 0) ||
                (sidebar && sidebar.offsetWidth > 0 && cascade);

            if (!panelVisible) {
                // Attempt to click toggle button
                const toggleBtns = Array.from(document.querySelectorAll('li.action-item a, button, [role="button"]'));
                let toggled = false;
                for (const btn of toggleBtns) {
                    const label = (btn.getAttribute('aria-label') || '').toLowerCase();
                    if (label.includes('toggle cascade') || label.includes('toggle secondary') ||
                        label.includes('toggle auxiliary') || label.includes('cascade')) {
                        if (btn.offsetWidth > 0 || btn.offsetHeight > 0) {
                            btn.click();
                            toggled = true;
                            break;
                        }
                    }
                }
 // button Cmd+L
                if (!toggled) {
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
                }

                // Wait for panel render (max 3 seconds)
                for (let i = 0; i < 30; i++) {
                    await new Promise(r => setTimeout(r, 100));
                    tabs = document.querySelectorAll('[id^="cascade-tab-"]');
                    if (tabs.length > 0) break;
                }
            }
        }

 // ─── 2. ───
        tabs = document.querySelectorAll('[id^="cascade-tab-"]');
        if (tabs.length === 0) return [];

        const result = [];
        const seen = new Set();

        tabs.forEach(tab => {
            const tabId = tab.id.replace('cascade-tab-', '');
            if (seen.has(tabId)) return;
            seen.add(tabId);

            let title = '';
            let cascadeId = tabId;
            let status = 'completed';

            // Extract title from React Fiber
            const fk = Object.keys(tab).find(k => k.startsWith('__reactFiber'));
            if (fk) {
                let fiber = tab[fk];
                for (let d = 0; d < 30 && fiber; d++) {
                    const p = fiber.memoizedProps;
                    if (p) {
                        if (p.title && typeof p.title === 'string') {
                            title = p.title;
                        }
                        if (p.cascadeId) {
                            cascadeId = p.cascadeId;
                        }
                        if (p.status && typeof p.status === 'string') {
                            status = p.status;
                        }
                        if (title) break;
                    }
                    fiber = fiber.return;
                }
            }

            // DOM fallback
            if (!title) {
                title = tab.textContent?.trim().substring(0, 100) || ('Chat ' + (result.length + 1));
            }

            const isVisible = tab.offsetHeight > 0 && tab.offsetWidth > 0;

            result.push({
                id: tabId,
                title: title.substring(0, 100),
                status: status,
                active: isVisible
            });
        });

        return result;
    } catch (e) {
        return [];
    }
})()
