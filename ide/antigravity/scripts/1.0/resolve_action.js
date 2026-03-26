/**
 * Antigravity v1 — resolve_action
 *
 * 스크롤 최하단 → scrollIntoView → .click()
 * 파라미터: ${BUTTON_TEXT}
 */
(() => {
    const want = ${ BUTTON_TEXT };
    const wantNorm = (want || '').replace(/\s+/g, ' ').trim().toLowerCase();

    function norm(t) { return (t || '').replace(/\s+/g, ' ').trim().toLowerCase(); }

    function matches(el) {
        const raw = (el.textContent || '').trim();
        const t = norm(raw);
        if (!t || t.length > 80) return false;
        if (t === wantNorm) return true;
        if (t.indexOf(wantNorm) === 0) return true;
        if (wantNorm.indexOf(t) >= 0 && t.length > 2) return true;
        if (t.indexOf(wantNorm) >= 0) return true;
        if (/^(run|approve|allow|accept|always|yes)\b/.test(wantNorm)) {
            if (/^run\b/.test(t)) return true;
            if (/^allow\b/.test(t)) return true;
            if (/^accept\b/.test(t) && !t.includes('changes')) return true;
            if (/^always\b/.test(t)) return true;
        }
        if (/^(reject|deny|no|abort)\b/.test(wantNorm)) {
            if (/^reject\b/.test(t) && !t.includes('changes')) return true;
            if (/^deny\b/.test(t)) return true;
        }
        if (/^(skip|cancel)\b/.test(wantNorm)) {
            if (/^skip\b/.test(t) || /^cancel\b/.test(t)) return true;
        }
        return false;
    }

    // 1. 채팅 패널 스크롤을 최하단으로
    const conv = document.querySelector('.antigravity-agent-side-panel') || document.querySelector('#conversation');
    const scrollEl = conv ? (conv.querySelector('.overflow-y-auto') || conv) : null;
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;

    // 2. viewport 필터 없이 DOM에 있는 모든 visible 버튼 검색
    const sel = 'button, [role="button"]';
    const allBtns = [...document.querySelectorAll(sel)].filter(b => b.offsetWidth > 0 && b.offsetHeight > 0);

    // 마지막(최신) 매칭 우선 — 역순 검색
    let found = null;
    for (let i = allBtns.length - 1; i >= 0; i--) {
        if (matches(allBtns[i])) {
            found = allBtns[i];
            break;
        }
    }

    if (found) {
        const text = found.textContent?.trim()?.substring(0, 40);
        // 버튼이 화면에 보이도록 스크롤 후 클릭
        try { found.scrollIntoView({ block: 'nearest' }); } catch (_) {}
        try { found.click(); } catch (_) {}
        return JSON.stringify({ resolved: true, clicked: text });
    }
    return JSON.stringify({ found: false, want: wantNorm });
})()
