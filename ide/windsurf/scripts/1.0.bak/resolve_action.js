/**
 * Windsurf v1 — resolve_action
 * 
 * 승인 다이얼로그/인라인 버튼을 클릭합니다.
 * 
 * 파라미터: ${ BUTTON_TEXT } — 클릭할 버튼 텍스트 (lowercase)
 * 
 * 최종 확인: Windsurf (2026-03-06)
 */
(() => {
    try {
        const want = ${ BUTTON_TEXT };
        const normalize = (s) => (s || '').replace(/[\s\u200b\u00a0]+/g, ' ').trim().toLowerCase();
        const matches = (text) => {
            const t = normalize(text);
            if (!t) return false;
            if (t === want) return true;
            if (t.indexOf(want) === 0) return true;
            if (want === 'run' && (/^run\s*/.test(t) || t === 'enter' || t === '⏎')) return true;
            if (want === 'approve' && (t.includes('approve') || t === 'always allow' || t === 'allow')) return true;
            if (want === 'reject' && (t.includes('reject') || t === 'deny' || t === 'always deny')) return true;
            return false;
        };
        const click = (el) => {
            el.focus?.();
            const rect = el.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
                el.dispatchEvent(new PointerEvent(type, {
                    bubbles: true, cancelable: true, view: window,
                    clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse'
                }));
            }
            return true;
        };

        // 1. Dialog 내부
        const dialog = document.querySelector('.monaco-dialog-box, [role="dialog"]');
        if (dialog && dialog.offsetWidth > 80) {
            const btns = dialog.querySelectorAll('.monaco-button, button');
            for (const b of btns) {
                if (matches(b.textContent)) return click(b);
            }
        }

        // 2. 모든 보이는 버튼
        const sel = 'button, [role="button"], .monaco-button';
        const allBtns = Array.from(document.querySelectorAll(sel))
            .filter(b => b.offsetWidth > 0 && b.offsetHeight > 0);
        for (const b of allBtns) {
            if (matches(b.textContent)) return click(b);
        }

        // 3. Enter 키 폴백 (run)
        if (want === 'run') {
            document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter', code: 'Enter', keyCode: 13,
                bubbles: true, cancelable: true
            }));
            return true;
        }

        return false;
    } catch (e) {
        return false;
    }
})()
