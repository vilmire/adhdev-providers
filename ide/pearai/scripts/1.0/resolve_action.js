/**
 * PearAI — resolve_action
 *
 * 승인/거부 버튼 찾기 + 좌표 반환.
 * PearAI의 approval 다이얼로그는 메인 DOM에 표시됨.
 *
 * 파라미터: ${ BUTTON_TEXT }
 */
(() => {
    const want = ${ BUTTON_TEXT };
    const wantNorm = (want || '').replace(/\s+/g, ' ').trim().toLowerCase();

    function norm(t) { return (t || '').replace(/\s+/g, ' ').trim().toLowerCase(); }

    function matches(el) {
        const t = norm(el.textContent);
        if (!t || t.length > 80) return false;
        if (t === wantNorm) return true;
        if (t.indexOf(wantNorm) === 0) return true;
        if (wantNorm.indexOf(t) >= 0 && t.length > 2) return true;
        if (/^(run|approve|allow|accept|yes)\b/.test(wantNorm)) {
            if (/^(run|allow|accept|approve)\b/.test(t)) return true;
        }
        if (/^(reject|deny|no|abort)\b/.test(wantNorm)) {
            if (/^(reject|deny)\b/.test(t)) return true;
        }
        return false;
    }

    const sel = 'button, [role="button"], .monaco-button';
    const allBtns = [...document.querySelectorAll(sel)].filter(b => {
        if (!b.offsetWidth || !b.getBoundingClientRect().height) return false;
        const rect = b.getBoundingClientRect();
        return rect.y > 0 && rect.y < window.innerHeight;
    });

    let found = null;
    for (let i = allBtns.length - 1; i >= 0; i--) {
        if (matches(allBtns[i])) { found = allBtns[i]; break; }
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
