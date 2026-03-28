/**
 * PearAI — webview_resolve_action
 *
 * PearAI Agent(Roo Code based)renders approve/reject button inside webview.
 * button click() event .
 *
 * Parameter: ${ BUTTON_TEXT }
 */
(() => {
    try {
        const doc = document.getElementById("active-frame")?.contentDocument || document;
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
                if (/^(run|allow|accept|approve|save)\b/.test(t)) return true;
            }
            if (/^(reject|deny|no|abort)\b/.test(wantNorm)) {
                if (/^(reject|deny)\b/.test(t)) return true;
            }
            return false;
        }

        const sel = 'button, [role="button"], .vsc-button';
        const allBtns = [...doc.querySelectorAll(sel)].filter(b => b.offsetWidth > 0 && b.offsetHeight > 0);

        let found = null;
        for (let i = allBtns.length - 1; i >= 0; i--) {
            if (matches(allBtns[i])) { found = allBtns[i]; break; }
        }

        if (found) {
            found.focus?.();
            const rect = found.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
                found.dispatchEvent(new PointerEvent(type, {
                    bubbles: true, cancelable: true, view: window,
                    clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse'
                }));
            }
            return JSON.stringify({
                resolved: true,
                clicked: found.textContent || wantNorm
            });
        }
        return JSON.stringify({ resolved: false, error: 'Button not found: ' + wantNorm });
    } catch (e) {
        return JSON.stringify({ resolved: false, error: e.message });
    }
})()
