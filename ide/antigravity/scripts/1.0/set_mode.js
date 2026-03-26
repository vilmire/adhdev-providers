/**
 * Antigravity — set_mode  [>= 1.107.0]
 * mode trigger: BUTTON with py-1 pl-1 pr-2 opacity-70
 * ${MODE} → JSON.stringify(modeName)
 * → { success: boolean, mode?: string }
 */
(async () => {
    try {
        const target = ${MODE};

        // ── Helper: find mode button ──────────────────────────────────────────
        function findModeBtn() {
            return [...document.querySelectorAll('button')].find(b => {
                const cls = b.className || '';
                return cls.includes('py-1') &&
                       cls.includes('pl-1') &&
                       cls.includes('pr-2') &&
                       cls.includes('opacity-70') &&
                       b.offsetWidth > 0;
            }) || null;
        }

        // ── Helper: click item in open "Conversation mode" panel ─────────────
        function clickModeItem(targetName) {
            const headers = document.querySelectorAll('.text-xs.px-2.pb-1.opacity-80');
            for (const header of headers) {
                if (header.textContent?.trim() === 'Conversation mode') {
                    const parent = header.parentElement;
                    if (!parent) continue;
                    for (const item of parent.querySelectorAll('.font-medium')) {
                        const text = item.textContent?.trim();
                        if (text && text.toLowerCase() === targetName.toLowerCase()) {
                            item.click();
                            return text;
                        }
                    }
                    break;
                }
            }
            return null;
        }

        // ── Step 1: Panel already open — direct click ─────────────────────────
        const direct = clickModeItem(target);
        if (direct) {
            await new Promise(r => setTimeout(r, 300));
            return JSON.stringify({ success: true, mode: direct });
        }

        // ── Step 2: Open panel via mode button, then click ───────────────────
        const modeBtn = findModeBtn();
        if (modeBtn) {
            modeBtn.click();
            await new Promise(r => setTimeout(r, 400));

            const hit = clickModeItem(target);
            if (hit) {
                return JSON.stringify({ success: true, mode: hit });
            }
            modeBtn.click(); // Close if not found
        }

        return JSON.stringify({ success: false, error: 'mode not found: ' + target });
    } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
    }
})()
