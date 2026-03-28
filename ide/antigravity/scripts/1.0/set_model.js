/**
 * Antigravity — set_model
 * model from Select model
 *
 * Version compatibility:
 *   v0 (old): .flex.min-w-0.max-w-full.cursor-pointer.items-center trigger
 *   v1 (new): Tailwind arbitrary values → partial matching required
 *   Both: dropdown items .px-2.py-1.flex.items-center.justify-between.cursor-pointer
 *
 * ${MODEL} → JSON.stringify(modelName)
 * → { success: boolean, model?: string }
 */
(async () => {
    try {
        const target = ${MODEL};

        // ── Helper: find model trigger button (v0 + v1 compat) ───────────────
        function findModelTrigger() {
            // v0: exact selector
            const v0 = document.querySelector('.flex.min-w-0.max-w-full.cursor-pointer.items-center');
            if (v0 && v0.offsetWidth > 0) return v0;
            // v1: partial matching
            return [...document.querySelectorAll('div, button')].find(e => {
                const cls = e.className || '';
                return cls.includes('min-w-0') &&
                       cls.includes('max-w-full') &&
                       cls.includes('cursor-pointer') &&
                       cls.includes('items-center') &&
                       e.offsetWidth > 0;
            }) || null;
        }

        // ── Helper: find and click a model from open dropdown ────────────────
        function clickModelItem(targetName) {
            const items = document.querySelectorAll('.px-2.py-1.flex.items-center.justify-between.cursor-pointer');
            for (const item of items) {
                const label = item.querySelector('.text-xs.font-medium');
                const text = (label || item).textContent?.trim();
                if (text && (text === targetName || text.toLowerCase().includes(targetName.toLowerCase()))) {
                    item.click();
                    return text;
                }
            }
            return null;
        }

        // ── Step 1: Dropdown already open — try direct click ─────────────────
        const directHit = clickModelItem(target);
        if (directHit) {
            await new Promise(r => setTimeout(r, 200));
            return JSON.stringify({ success: true, model: directHit });
        }

        // ── Step 2: Dropdown closed — open trigger, then select ──────────────
        const trigger = findModelTrigger();
        if (trigger) {
            trigger.click();
            await new Promise(r => setTimeout(r, 400));

            const hit = clickModelItem(target);
            if (hit) {
                return JSON.stringify({ success: true, model: hit });
            }
            // Close dropdown if target not found
            trigger.click();
        }

        return JSON.stringify({ success: false, error: 'model not found: ' + target });
    } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
    }
})()
