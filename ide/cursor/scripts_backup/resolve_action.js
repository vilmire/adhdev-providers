/**
 * Cursor v1 — resolve_action
 *
 * CURSOR.md 4-3: 탐색 순서 5단계 + 특수 매칭
 *   ① run-command-review
 *   ② overlay 컨테이너
 *   ③ dialog 박스
 *   ④ 전역 버튼 검색
 *   ⑤ "run" 시 Enter 키 폴백
 *
 * 파라미터: ${ BUTTON_TEXT } (JSON.stringify된 lowercase 문자열)
 * 최종 확인: 2026-03-06
 */
(() => {
    const want = ${ BUTTON_TEXT };
    function norm(t) { return (t || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
    function matches(el) {
        const t = norm(el.textContent);
        if (t.length > 80) return false;
        if (t === want) return true;
        if (t.indexOf(want) === 0) return true;
        if (want === 'run' && (/^run\s*/.test(t) || t === 'enter' || t === '⏎')) return true;
        if (want === 'skip' && t.indexOf('skip') >= 0) return true;
        if (want === 'reject' && t.indexOf('reject') >= 0) return true;
        if (want === 'accept' && t.indexOf('accept') >= 0) return true;
        if (want === 'approve' && t.indexOf('approve') >= 0) return true;
        if (want === 'allow' && (t.indexOf('allow') >= 0 || t === 'always allow')) return true;
        if (want === 'deny' && (t.indexOf('deny') >= 0 || t === 'always deny')) return true;
        return false;
    }
    // COMMON.md 7장: React 호환 PointerEvent 클릭 (Cursor는 React 합성 이벤트 사용)
    function doClick(el) {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const evtOpts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse' };
        try {
            el.focus && el.focus();
            // React가 수신하는 전체 이벤트 시퀀스
            for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
                el.dispatchEvent(new PointerEvent(type, evtOpts));
            }
        } catch (_) {
            // PointerEvent 미지원 폴백
            el.click && el.click();
        }
    }
    const sel = 'button, [role="button"], .monaco-button, .solid-dropdown-toggle, [class*="action-button"], [class*="btn"], .anysphere-button, [class*="composer-run-button"], [class*="composer-skip-button"]';

    // ① run-command-review (CURSOR.md)
    const runReview = document.querySelector('[class*="run-command-review"]');
    if (runReview) {
        const btns = Array.from(runReview.querySelectorAll(sel)).filter(b => b.offsetWidth > 0);
        for (const b of btns) { if (matches(b)) { doClick(b); return true; } }
    }
    // ② overlay (CURSOR.md)
    const overlays = document.querySelectorAll('.quick-agent-overlay-container, [class*="overlay-container"], [class*="tool-call-actions"]');
    for (const overlay of overlays) {
        const btns = Array.from(overlay.querySelectorAll(sel)).filter(b => b.offsetWidth > 0);
        for (const b of btns) { if (matches(b)) { doClick(b); return true; } }
    }
    // ③ dialog (CURSOR.md)
    const dialogs = document.querySelectorAll('.monaco-dialog-box, .monaco-modal-block, [role="dialog"]');
    for (const dialog of dialogs) {
        if (dialog.offsetWidth === 0) continue;
        const btns = Array.from(dialog.querySelectorAll(sel)).filter(b => b.offsetWidth > 0);
        for (const b of btns) { if (matches(b)) { doClick(b); return true; } }
    }
    // ④ 전역 검색 (ui-collapsible-header 제외)
    const allBtns = Array.from(document.querySelectorAll(sel)).filter(b => b.offsetWidth > 0 && b.getBoundingClientRect().height > 0 && !b.classList.contains('ui-collapsible-header'));
    for (const b of allBtns) { if (matches(b)) { doClick(b); return true; } }
    // ④-B: 마지막 AI 메시지 안 인라인 버튼 (Cursor Agent mode Skip/Run)
    const aiMsgs = document.querySelectorAll('[data-message-role="ai"]');
    const lastAi = aiMsgs[aiMsgs.length - 1];
    if (lastAi) {
        const inlineBtns = Array.from(lastAi.querySelectorAll(sel)).filter(b => b.offsetWidth > 0 && !b.classList.contains('ui-collapsible-header'));
        for (const b of inlineBtns) { if (matches(b)) { doClick(b); return true; } }
    }
    // ⑤ Enter 키 폴백 ("run" 요청 시)
    if (want === 'run') {
        const focused = document.activeElement;
        if (focused) {
            focused.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            focused.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            return true;
        }
    }
    return false;
})()
