/**
 * Antigravity v1 — resolve_action
 * 
 * 버튼 찾기 + 좌표 반환 (CDP Input.dispatchMouseEvent로 클릭)
 * 파라미터: ${BUTTON_TEXT}
 * 
 * 핵심: viewport 안에 보이는 버튼 중 마지막(최신) 매칭 우선
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
    
    const sel = 'button, [role="button"]';
    const allBtns = [...document.querySelectorAll(sel)].filter(b => {
        if (!b.offsetWidth || !b.getBoundingClientRect().height) return false;
        const rect = b.getBoundingClientRect();
        // viewport 안에 보이는 것만 (y > 0, y < window.innerHeight)
        return rect.y > 0 && rect.y < window.innerHeight;
    });
    
    // 마지막(최신) 매칭 우선 — 역순 검색
    let found = null;
    for (let i = allBtns.length - 1; i >= 0; i--) {
        if (matches(allBtns[i])) {
            found = allBtns[i];
            break;
        }
    }
    
    if (found) {
        const rect = found.getBoundingClientRect();
        return JSON.stringify({
            found: true,
            text: found.textContent?.trim()?.substring(0, 40),
            x: Math.round(rect.x + rect.width / 2),
            y: Math.round(rect.y + rect.height / 2),
            w: Math.round(rect.width),
            h: Math.round(rect.height)
        });
    }
    return JSON.stringify({ found: false, want: wantNorm });
})()
