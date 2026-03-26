/**
 * Antigravity v1 — new_session
 *
 * Antigravity Agent 패널 상단의 + 아이콘 클릭으로 새 대화 시작.
 *
 * DOM 구조:
 *   .antigravity-agent-side-panel 상단 아이콘 바
 *     [0] <a> + (Plus) → 새 대화    ← 이것을 클릭
 *     [1] <a> 히스토리 (data-past-conversations-toggle)
 *     [2] <div> 더보기 (⋯)
 *     [3] <a> 닫기 (✕)
 *
 * 전략:
 *   1. 히스토리 토글의 이전 형제 <a> 클릭 (Plus 아이콘)
 *   2. SVG path "M12 4.5v15m7.5-7.5h-15" (+ 모양) 찾기
 *   3. 패널 상단 첫 번째 <a> 클릭 폴백
 *
 * 최종 확인: 2026-03-11
 */
(() => {
    try {
        // ─── 1. 히스토리 토글의 이전 형제 요소 (Plus 아이콘) ───
        const toggle = document.querySelector('[data-past-conversations-toggle="true"]');
        if (toggle) {
            const parent = toggle.parentElement;
            if (parent) {
                const children = Array.from(parent.children).filter(c => c.offsetWidth > 0);
                const toggleIdx = children.indexOf(toggle);
                // Plus 아이콘은 히스토리 바로 앞
                if (toggleIdx > 0) {
                    const plusBtn = children[toggleIdx - 1];
                    plusBtn.click();
                    return 'clicked (sibling of toggle)';
                }
            }
        }

        // ─── 2. SVG path 기반: Plus(+) 모양 SVG ───
        const panel = document.querySelector('.antigravity-agent-side-panel') || document.querySelector('#conversation');
        if (panel) {
            const svgs = panel.querySelectorAll('svg');
            for (const svg of svgs) {
                const path = svg.querySelector('path');
                if (path) {
                    const d = path.getAttribute('d') || '';
                    // Plus 아이콘 SVG: 세로선 + 가로선
                    if (d.includes('v15') && d.includes('h-15')) {
                        const clickable = svg.closest('a') || svg.closest('button') || svg.parentElement;
                        if (clickable) {
                            clickable.click();
                            return 'clicked (svg plus)';
                        }
                    }
                }
            }
        }

        // ─── 3. 폴백: 패널 상단 영역의 첫 번째 <a> ───
        if (panel) {
            const topLinks = Array.from(panel.querySelectorAll('a')).filter(a => {
                const r = a.getBoundingClientRect();
                const pr = panel.getBoundingClientRect();
                return r.y < pr.y + 30 && a.offsetWidth > 0 && a.offsetWidth < 30;
            });
            if (topLinks.length > 0) {
                topLinks[0].click();
                return 'clicked (first top link)';
            }
        }

        return 'no new session button found';
    } catch (e) {
        return 'error: ' + e.message;
    }
})()
