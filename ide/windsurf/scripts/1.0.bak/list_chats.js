/**
 * Windsurf v1 — list_chats
 * 
 * Cascade 탭 목록을 가져옵니다.
 * 패널이 닫혀 있으면 먼저 열고 탭이 렌더링될 때까지 대기합니다.
 * cascade-tab-{uuid} 요소들의 React Fiber에서 제목을 추출합니다.
 * 
 * 최종 확인: Windsurf 1.108.x (2026-03-10)
 */
(async () => {
    try {
        // ─── 1. 패널이 닫혀 있으면 열기 ───
        let tabs = document.querySelectorAll('[id^="cascade-tab-"]');
        if (tabs.length === 0) {
            // Cascade 패널 보이는지 확인
            const cascade = document.querySelector('#windsurf\\.cascadePanel') ||
                document.querySelector('.chat-client-root');
            const sidebar = document.getElementById('workbench.parts.auxiliarybar');
            const panelVisible = (cascade && cascade.offsetWidth > 0) ||
                (sidebar && sidebar.offsetWidth > 0 && cascade);

            if (!panelVisible) {
                // Toggle 버튼 클릭 시도
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
                // 버튼 없으면 Cmd+L
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

                // 패널 렌더링 대기 (최대 3초)
                for (let i = 0; i < 30; i++) {
                    await new Promise(r => setTimeout(r, 100));
                    tabs = document.querySelectorAll('[id^="cascade-tab-"]');
                    if (tabs.length > 0) break;
                }
            }
        }

        // ─── 2. 탭 정보 수집 ───
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

            // React Fiber에서 제목 추출
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

            // DOM 폴백
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
