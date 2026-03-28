/**
 * Antigravity — list_modes
 * Current mode + use Mode list extract
 *
 * Version compatibility:
 *   v0 (old): span-based mode button (plain text, no opacity class)
 *   v1 (new): BUTTON element with py-1 pl-1 pr-2 opacity-70 classes
 *   Both: "Conversation mode" panel with .font-medium items (when dropdown open)
 *
 * → { modes: string[], current: string }
 */
(() => {
    try {
        const modes = [];
        let current = '';

        // ── Helper: find mode trigger button (v0 + v1 compat) ────────────────
        function findModeTrigger() {
            // v1: BUTTON with opacity-70 + py-1 pl-1 pr-2
            const v1 = [...document.querySelectorAll('button')].find(b => {
                const cls = b.className || '';
                return cls.includes('py-1') &&
                       cls.includes('pl-1') &&
                       cls.includes('pr-2') &&
                       cls.includes('opacity-70') &&
                       b.offsetWidth > 0;
            });
            if (v1) return v1;

            // v0: span/button with py-1 pl-1 pr-2 (without opacity-70)
            return [...document.querySelectorAll('button, span')].find(b => {
                const cls = b.className || '';
                return cls.includes('py-1') &&
                       cls.includes('pl-1') &&
                       cls.includes('pr-2') &&
                       b.offsetWidth > 0 &&
                       // ensure it's in the model/mode area (not some other button)
                       (b.textContent?.trim() === 'Fast' || b.textContent?.trim() === 'Planning' || b.textContent?.trim() === 'Normal');
            }) || null;
        }

        // ── Step 1: "Conversation mode" panel open — extract items ───────────
        const headers = document.querySelectorAll('.text-xs.px-2.pb-1.opacity-80');
        for (const header of headers) {
            if (header.textContent?.trim() === 'Conversation mode') {
                const parent = header.parentElement;
                if (!parent) continue;
                const items = parent.querySelectorAll('.font-medium');
                for (const item of items) {
                    const text = item.textContent?.trim();
                    if (text && text.length < 20) modes.push(text);
                }
                break;
            }
        }

        // ── Step 2: Read current mode from trigger button ─────────────────────
        const modeBtn = findModeTrigger();
        if (modeBtn) {
            current = modeBtn.textContent?.trim() || '';
        }

        // ── Fallback: default modes ───────────────────────────────────────────
        if (modes.length === 0) {
            modes.push('Planning', 'Fast');
        }

        return JSON.stringify({ modes, current });
    } catch (e) {
        return JSON.stringify({ modes: [], current: '', error: e.message });
    }
})()
