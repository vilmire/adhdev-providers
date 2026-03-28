/**
 * Antigravity v1 — switch_session (v7 — CDP click Return)
 *
 * ⚠️ delete button(trash SVG)never accessed.
 * 
 * two types mode:
 *   1) Open history toggle and if row coordinates found {clickX, clickY} Return → daemon handles via CDP click
 * 2) workspace row Return ( Select)
 *
 * Parameter: ${SESSION_ID} — conversation title ()
 */
(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const id = ${SESSION_ID};

    try {
        // 1. history toggle click
        const toggle = document.querySelector('[data-past-conversations-toggle="true"]');
        if (!toggle) return JSON.stringify({ error: 'no_toggle' });
        toggle.click();
        await sleep(1200);

 // 2. Container search ( : "Current" text or "Select a conversation" input)
        let container = null;

        // 2a. "Current" text-based
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        while (walker.nextNode()) {
            if (walker.currentNode.textContent.trim() === 'Current') {
                let el = walker.currentNode.parentElement;
                for (let i = 0; i < 10 && el; i++) {
                    const cls = (el.className || '');
                    if (typeof cls === 'string' && (cls.includes('overflow-auto') || cls.includes('overflow-y-scroll'))) {
                        container = el; break;
                    }
                    el = el.parentElement;
                }
                if (!container) {
                    el = walker.currentNode.parentElement;
                    let bestEl = null, bestCount = 0;
                    for (let i = 0; i < 8 && el; i++) {
                        const rows = el.querySelectorAll('[class*="cursor-pointer"][class*="justify-between"][class*="rounded-md"]');
                        if (rows.length > bestCount) { bestCount = rows.length; bestEl = el; }
                        el = el.parentElement;
                    }
                    container = bestEl;
                }
                if (container) break;
            }
        }

        // 2b. fallback: "Select a conversation" input based
        if (!container) {
            const searchInput = Array.from(document.querySelectorAll('input[type="text"]'))
                .find(i => i.offsetWidth > 0 && (i.placeholder || '').includes('Select a conversation'));
            if (searchInput) {
                let el = searchInput.parentElement;
                for (let i = 0; i < 10 && el; i++) {
                    const cls = (el.className || '');
                    if (typeof cls === 'string' && (cls.includes('overflow-auto') || cls.includes('overflow-y-scroll'))) {
                        container = el; break;
                    }
                    const rows = el.querySelectorAll('[class*="cursor-pointer"][class*="justify-between"][class*="rounded-md"]');
                    if (rows.length > 0 && !container) container = el;
                    el = el.parentElement;
                }
            }
        }

        if (!container) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
            return JSON.stringify({ error: 'no_container' });
        }

        // 3. row matching
        const rows = container.querySelectorAll('[class*="cursor-pointer"][class*="justify-between"][class*="rounded-md"]');
        const norm = s => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const idNorm = norm(id);
        let targetRow = null;

        for (const row of rows) {
            // Skip currently active conversation
            if ((row.className || '').includes('focusBackground')) continue;
            const titleEl = row.querySelector('span span');
            const title = titleEl ? norm(titleEl.textContent) : '';
            if (!title) continue;
            if (title.includes(idNorm) || idNorm.includes(title)) {
                targetRow = row;
                break;
            }
        }

        if (!targetRow) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
            return JSON.stringify({ error: 'no_match', rowCount: rows.length });
        }

 // 4. row calculation → daemon CDP Input.dispatchMouseEvent click
        const rect = targetRow.getBoundingClientRect();
        const clickX = Math.round(rect.left + rect.width * 0.3);
        const clickY = Math.round(rect.top + rect.height / 2);

        return JSON.stringify({
            action: 'click',
            clickX,
            clickY,
            title: (targetRow.querySelector('span span')?.textContent || '').substring(0, 60)
        });

    } catch (e) {
        try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); } catch (_) { }
        return JSON.stringify({ error: e.message });
    }
})()
