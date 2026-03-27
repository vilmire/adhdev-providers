/**
 * Windsurf v1 — list_sessions
 * 
 * Cascade 세션 리스트를 가져옵니다.
 * 1. 상단 탭 ([id^="cascade-tab-"])
 * 2. 히스토리 패널 ([data-kb-navigate="true"])
 */
 (async () => {
    try {
        const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        const isVisible = (el) => !!(el && el.offsetWidth > 0 && el.offsetHeight > 0);
        const cascade = document.querySelector('#windsurf\\.cascadePanel') || document.querySelector('.chat-client-root');
        if (!cascade) return JSON.stringify({ sessions: [] });

        const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim();
        const activeTabEl = document.querySelector('[id^="cascade-tab-"] .bg-ide-tab-active-background-color');
        const activeTabTitle = normalize(activeTabEl?.textContent || document.querySelector('.bg-ide-tab-active-background-color .truncate')?.textContent || '');

        const sessions = [];
        const seenIds = new Set();
        const seenTitles = new Set();

        // 1. 상단 탭
        const tabs = Array.from(document.querySelectorAll('[id^="cascade-tab-"]')).filter(isVisible);
        for (const tab of tabs) {
            const fullId = tab.id || '';
            const id = fullId.replace('cascade-tab-', '');
            const title = normalize(tab.textContent);
            if (!title || title === 'New Cascade') continue;
            
            // 활성 상태 확인: 특정 클래스 or 내부 요소의 클래스 or ARIA 속성
            const isActive = tab.classList.contains('bg-ide-tab-active-background-color') || 
                           !!tab.querySelector('.bg-ide-tab-active-background-color') ||
                           tab.getAttribute('aria-selected') === 'true';

            seenIds.add(id);
            seenTitles.add(title.toLowerCase());
            sessions.push({
                id,
                title,
                active: isActive,
                index: sessions.length
            });
        }

        // 2. 히스토리 패널
        const historyButton = Array.from(cascade.querySelectorAll('button')).find(el => isVisible(el) && /lucide-history/.test(el.innerHTML || ''));
        const existingPanel = Array.from(cascade.querySelectorAll('div')).find(el => isVisible(el) && (String(el.className || '').includes('group/panel') || el.hasAttribute('data-kb-navigate')));
        const wasOpen = !!existingPanel;

        if (!wasOpen && historyButton) {
            historyButton.click();
            await wait(300);
        }

        const historyRows = Array.from(document.querySelectorAll('[data-kb-navigate="true"]')).filter(isVisible);
        for (const row of historyRows) {
            const title = normalize(row.querySelector('.truncate, span')?.textContent || row.textContent);
            if (!title || seenTitles.has(title.toLowerCase())) continue;
            
            seenTitles.add(title.toLowerCase());
            sessions.push({
                id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                title,
                active: title === activeTabTitle,
                index: sessions.length
            });
        }

        if (!wasOpen && historyButton) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));
        }

        return JSON.stringify({ sessions });
    } catch (e) {
        return JSON.stringify({ sessions: [], error: e.message });
    }
})()

