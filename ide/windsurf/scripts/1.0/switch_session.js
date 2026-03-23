/**
 * Windsurf v1 — switch_session
 * 
 * Cascade 세션(대화) 탭을 전환합니다.
 * cascade-tab-{id} 내부의 실제 클릭 가능한 자식 DIV의
 * React onClick 핸들러를 직접 호출합니다.
 * 
 * 파라미터: ${ SESSION_ID } — 전환할 세션 ID (cascade-tab의 UUID)
 * 
 * 최종 확인: Windsurf 1.108.x (2026-03-10)
 */
(() => {
    try {
        const id = ${ SESSION_ID };

        // Helper: find React onClick on an element or its children
        function clickReact(el) {
            // Check element itself and children for React onClick
            const targets = [el, ...el.querySelectorAll('*')];
            for (const t of targets) {
                const rp = Object.keys(t).find(k => k.startsWith('__reactProps'));
                if (rp && typeof t[rp].onClick === 'function') {
                    t[rp].onClick({
                        preventDefault: () => { },
                        stopPropagation: () => { },
                        nativeEvent: { stopImmediatePropagation: () => { } },
                        target: t, currentTarget: t, button: 0, type: 'click'
                    });
                    return true;
                }
            }
            return false;
        }

        // 1. cascade-tab-{id} 요소 찾기
        const tab = document.getElementById('cascade-tab-' + id);
        if (tab) {
            if (clickReact(tab)) return 'switched';
            // Fallback: DOM click
            tab.click();
            return 'switched-dom';
        }

        // 2. 제목으로 매칭
        const tabs = document.querySelectorAll('[id^="cascade-tab-"]');
        for (const t of tabs) {
            if (t.textContent?.trim() === id) {
                if (clickReact(t)) return 'switched-by-title';
                t.click();
                return 'switched-by-title-dom';
            }
        }

        return 'not_found';
    } catch (e) {
        return 'error: ' + e.message;
    }
})()
