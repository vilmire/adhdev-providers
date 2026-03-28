/**
 * Antigravity v1 — list_chats (v3 — enhanced selector)
 *
 * history toggle click open conversation list panel,
 * DOMfrom parse conversation list directly, close panel and return results.
 *
 * DOM structure (2026-03-03 Check):
 *   toggle: [data-past-conversations-toggle="true"]
 *   panel: input[placeholder="Select a conversation"] near
 *   section header: .opacity-50 text (Current, Recent, Other)
 *   row: .cursor-pointer.justify-between.rounded-md
 *     ├── Title: span > span
 *     ├── workspace: .opacity-50.truncate > span
 *     └── time: .opacity-50.flex-shrink-0
 */
(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    try {
 // 1. toggle click history panel open
        const toggle = document.querySelector('[data-past-conversations-toggle="true"]');
        if (!toggle) return [];
        toggle.click();
        await sleep(1000);

 // 2. Exact search input search (placeholder matching)
        const allInputs = document.querySelectorAll('input[type="text"]');
        let searchInput = null;
        for (const inp of allInputs) {
            if (inp.placeholder === 'Select a conversation' && inp.offsetWidth > 0) {
                searchInput = inp;
                break;
            }
        }

        if (!searchInput) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
            return [];
        }

        // 3. "Current" Search conversation list scroll container based on text
        let container = null;
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        while (walker.nextNode()) {
            if (walker.currentNode.textContent.trim() === 'Current') {
                // "Current" text ancestor — climb up to overflow-auto/scroll container
                let el = walker.currentNode.parentElement;
                for (let i = 0; i < 10 && el; i++) {
                    const cls = (el.className || '');
                    if (typeof cls === 'string' && (cls.includes('overflow-auto') || cls.includes('overflow-y-scroll'))) {
                        container = el;
                        break;
                    }
                    el = el.parentElement;
                }
                // If overflow container not found, use ancestor with most rows
                if (!container) {
                    el = walker.currentNode.parentElement;
                    let bestEl = null;
                    let bestCount = 0;
                    for (let i = 0; i < 8 && el; i++) {
                        const rows = el.querySelectorAll('[class*="cursor-pointer"][class*="justify-between"][class*="rounded-md"]');
                        if (rows.length > bestCount) {
                            bestCount = rows.length;
                            bestEl = el;
                        }
                        el = el.parentElement;
                    }
                    container = bestEl;
                }
                if (container) break;
            }
        }

        // fallback: "Current" textwhen absent (new conversation etc. after) searchInput based
        if (!container && searchInput) {
            let el = searchInput.parentElement;
            for (let i = 0; i < 10 && el; i++) {
                const cls = (el.className || '');
                if (typeof cls === 'string' && (cls.includes('overflow-auto') || cls.includes('overflow-y-scroll'))) {
                    container = el; break;
                }
                const rows = el.querySelectorAll('[class*="cursor-pointer"][class*="justify-between"][class*="rounded-md"]');
                if (rows.length > 0 && !container) {
                    container = el;
                }
                el = el.parentElement;
            }
        }

        if (!container) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
            return [];
        }

        // 4. conversation row parsing
        const rows = container.querySelectorAll('[class*="cursor-pointer"][class*="justify-between"][class*="rounded-md"]');
        const chats = [];

        for (const row of rows) {
            const titleEl = row.querySelector('span span');
            const title = titleEl ? titleEl.textContent.trim() : '';
            if (!title) continue;

            const timeEl = row.querySelector('span[class*="opacity-50"][class*="flex-shrink-0"]');
            const time = timeEl ? timeEl.textContent.trim() : '';

            const wsEl = row.querySelector('span[class*="opacity-50"][class*="truncate"] span');
            const workspace = wsEl ? wsEl.textContent.trim() : '';

            const isCurrent = (row.className || '').includes('focusBackground');

            let section = '';
            const sectionHeader = row.parentElement?.querySelector('[class*="opacity-50"]:not([class*="cursor-pointer"])');
            if (sectionHeader) {
                section = sectionHeader.textContent.trim();
            }

            chats.push({
                id: title,
                title,
                status: isCurrent ? 'current' : '',
                time,
                workspace,
                section,
            });
        }

        // 5. panel close
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));

        return chats;
    } catch (e) {
        try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); } catch (_) { }
        return [];
    }
})()
