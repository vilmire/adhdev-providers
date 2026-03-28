/**
 * Windsurf v1 — resolve_action
 * 
 * approval Click dialogue/inline button.
 * 
 * Parameter: ${ BUTTON_TEXT } — click button text (lowercase)
 * 
 * final Check: Windsurf (2026-03-06)
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

        // 1. Dialog inside
        const dialog = document.querySelector('.monaco-dialog-box, [role="dialog"]');
        if (dialog && dialog.offsetWidth > 80) {
            const btns = dialog.querySelectorAll('.monaco-button, button');
            for (const b of btns) {
                if (matches(b.textContent)) return click(b);
            }
        }

        // 2. all visible button
        const sel = 'button, [role="button"], .monaco-button';
        const allBtns = Array.from(document.querySelectorAll(sel))
            .filter(b => b.offsetWidth > 0 && b.offsetHeight > 0);
        for (const b of allBtns) {
            if (matches(b.textContent)) return click(b);
        }

        // 3. Enter key fallback (run)
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
