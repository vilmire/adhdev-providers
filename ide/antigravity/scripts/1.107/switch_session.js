/**
 * Antigravity v1 — switch_session (v7 — CDP 마우스 클릭 좌표 반환)
 *
 * ⚠️ 삭제 버튼(trash SVG)에 절대 접근하지 않음.
 * 
 * 두 가지 모드:
 *   1) 히스토리 토글을 열고 행 좌표를 찾으면 {clickX, clickY} 반환 → daemon이 CDP 클릭으로 처리
 *   2) 워크스페이스 다이얼로그가 뜨면 첫 번째 행 좌표 반환 (자동 선택용)
 *
 * 파라미터: ${SESSION_ID} — 대화 제목 (문자열)
 */
(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const id = ${SESSION_ID};

    try {
        // 1. 히스토리 토글 클릭
        const toggle = document.querySelector('[data-past-conversations-toggle="true"]');
        if (!toggle) return JSON.stringify({ error: 'no_toggle' });
        toggle.click();
        await sleep(1200);

        // 2. 컨테이너 찾기 (기존 로직: "Current" 텍스트 또는 "Select a conversation" input)
        let container = null;

        // 2a. "Current" 텍스트 기반
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        while (walker.nextNode()) {
            if (walker.currentNode.textContent.trim() === 'Current') {
                let el = walker.currentNode.parentElement;
                for (let i = 0; i < 10 && el; i++) {
                    const cls = (el.className || '');
                    if (typeof cls === 'string' && (cls.includes('overflow-auto') || cls.includes('overflow-y-scroll'))) {
                        container = el; break;
                    }
                    el = el.parentElement;
                }
                if (!container) {
                    el = walker.currentNode.parentElement;
                    let bestEl = null, bestCount = 0;
                    for (let i = 0; i < 8 && el; i++) {
                        const rows = el.querySelectorAll('[class*="cursor-pointer"][class*="justify-between"][class*="rounded-md"]');
                        if (rows.length > bestCount) { bestCount = rows.length; bestEl = el; }
                        el = el.parentElement;
                    }
                    container = bestEl;
                }
                if (container) break;
            }
        }

        // 2b. 폴백: "Select a conversation" input 기반
        if (!container) {
            const searchInput = Array.from(document.querySelectorAll('input[type="text"]'))
                .find(i => i.offsetWidth > 0 && (i.placeholder || '').includes('Select a conversation'));
            if (searchInput) {
                let el = searchInput.parentElement;
                for (let i = 0; i < 10 && el; i++) {
                    const cls = (el.className || '');
                    if (typeof cls === 'string' && (cls.includes('overflow-auto') || cls.includes('overflow-y-scroll'))) {
                        container = el; break;
                    }
                    const rows = el.querySelectorAll('[class*="cursor-pointer"][class*="justify-between"][class*="rounded-md"]');
                    if (rows.length > 0 && !container) container = el;
                    el = el.parentElement;
                }
            }
        }

        if (!container) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
            return JSON.stringify({ error: 'no_container' });
        }

        // 3. 행 매칭
        const rows = container.querySelectorAll('[class*="cursor-pointer"][class*="justify-between"][class*="rounded-md"]');
        const norm = s => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const idNorm = norm(id);
        let targetRow = null;

        for (const row of rows) {
            // 현재 활성 대화 스킵
            if ((row.className || '').includes('focusBackground')) continue;
            const titleEl = row.querySelector('span span');
            const title = titleEl ? norm(titleEl.textContent) : '';
            if (!title) continue;
            if (title.includes(idNorm) || idNorm.includes(title)) {
                targetRow = row;
                break;
            }
        }

        if (!targetRow) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
            return JSON.stringify({ error: 'no_match', rowCount: rows.length });
        }

        // 4. 행의 좌표 계산 → daemon이 CDP Input.dispatchMouseEvent로 클릭
        const rect = targetRow.getBoundingClientRect();
        const clickX = Math.round(rect.left + rect.width * 0.3);
        const clickY = Math.round(rect.top + rect.height / 2);

        return JSON.stringify({
            action: 'click',
            clickX,
            clickY,
            title: (targetRow.querySelector('span span')?.textContent || '').substring(0, 60)
        });

    } catch (e) {
        try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); } catch (_) { }
        return JSON.stringify({ error: e.message });
    }
})()
