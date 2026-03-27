/**
 * Windsurf v1 — open_panel
 *
 * Cascade(AI 채팅) 패널이 닫혀 있을 때 열기.
 *
 * Windsurf의 Cascade 패널은 Secondary Side Bar (#workbench.parts.auxiliarybar)에 위치.
 * 닫혀 있으면 offsetWidth === 0.
 * Cmd+L 단축키로 열 수 있음 (WINDSURF.md §2.5).
 *
 * 반환: 'visible' | 'opened' | 'error: ...'
 * 최종 확인: Windsurf 1.108.x (2026-03-10)
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
