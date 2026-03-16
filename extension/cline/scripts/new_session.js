/**
 * Cline v1 — new_session
 *
 * 구조:
 *   1. "New Task" 버튼 또는 "+" 버튼 클릭
 *   2. data-testid 우선 → aria-label → 텍스트 매칭
 *
 * 최종 확인: 2026-03-07
 */
(() => {
    try {
        const inner = document.querySelector('iframe');
        const doc = inner?.contentDocument || inner?.contentWindow?.document;
        if (!doc) return 'no doc';

        const buttons = Array.from(doc.querySelectorAll('button'))
            .filter(b => b.offsetWidth > 0 && b.offsetHeight > 0);

        // ─── 1단계: data-testid 기반 ───
        for (const btn of buttons) {
            const testId = (btn.getAttribute('data-testid') || '').toLowerCase();
            if (testId.includes('new-task') || testId.includes('new-chat') || testId.includes('new_task')) {
                btn.click();
                return 'clicked (testid)';
            }
        }

        // ─── 2단계: aria-label 기반 ───
        for (const btn of buttons) {
            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (ariaLabel.includes('new task') || ariaLabel.includes('new chat')
                || ariaLabel.includes('plus') || ariaLabel === 'new') {
                btn.click();
                return 'clicked (aria)';
            }
        }

        // ─── 3단계: 텍스트 매칭 ───
        for (const btn of buttons) {
            const text = (btn.textContent || '').trim();
            if (text === '+' || text.includes('New Task') || text.includes('New Chat')) {
                btn.click();
                return 'clicked (text)';
            }
        }

        // ─── 4단계: SVG plus 아이콘 버튼 ───
        for (const btn of buttons) {
            const svg = btn.querySelector('svg');
            if (!svg) continue;
            const path = svg.querySelector('path');
            if (path) {
                const d = path.getAttribute('d') || '';
                // SVG plus icon의 일반적인 path pattern
                if (d.includes('M12') && (d.includes('H5') || d.includes('h') || d.includes('v'))) {
                    // 다른 버튼 텍스트가 없는 아이콘 전용 버튼
                    const text = (btn.textContent || '').trim();
                    if (text.length < 3) {
                        btn.click();
                        return 'clicked (svg)';
                    }
                }
            }
        }

        // ─── 5단계: 웰컴 화면 감지 (이미 새 세션) ───
        const bodyText = (doc.body.textContent || '').toLowerCase();
        if (bodyText.includes('what can i do for you') || bodyText.includes('start a new task') || bodyText.includes('type your task')) {
            return 'clicked (already new)';
        }

        // ─── 6단계: History 뷰 감지 → Done 클릭으로 웰컴 복귀 ───
        if (bodyText.includes('history') && bodyText.includes('done')) {
            for (const btn of buttons) {
                const text = (btn.textContent || '').trim();
                if (text === 'Done') {
                    btn.click();
                    return 'clicked (history done)';
                }
            }
        }

        return 'no button found';
    } catch (e) { return 'error: ' + e.message; }
})()
