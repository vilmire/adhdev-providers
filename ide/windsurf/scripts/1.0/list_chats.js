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
        const tabs = Array.from(document.querySelectorAll('[id^="cascade-tab-"]')).filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);
        const sessions = tabs.map((tab, index) => ({
            id: tab.id.replace(/^cascade-tab-/, ''),
            title: (tab.textContent || '').replace(/\s+/g, ' ').trim() || `Chat ${index + 1}`,
            active: /bg-ide-tab-active-background-color/.test(tab.innerHTML || ''),
            index,
        }));
        return JSON.stringify({ sessions });
    } catch (e) {
        return JSON.stringify({ sessions: [], error: e.message });
    }
})()
