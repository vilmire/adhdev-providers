/**
 * Antigravity v1 — new_session
 *
 * Antigravity Agent panel + icon by clicking new conversation start.
 *
 * DOM structure:
 *   .antigravity-agent-side-panel top icon bar
 * [0] <a> + (Plus) → new conversation ← click
 *     [1] <a> history (data-past-conversations-toggle)
 *     [2] <div> more (⋯)
 *     [3] <a> close (✕)
 *
 * strategy:
 *   1. Previous sibling of history toggle <a> click (Plus icon)
 *   2. Find SVG path "M12 4.5v15m7.5-7.5h-15" (+ shape)
 * 3. panel <a> click fallback
 *
 * final Check: 2026-03-11
 */
(() => {
    try {
        // ─── 1. Previous sibling of history toggle (Plus icon) ───
        const toggle = document.querySelector('[data-past-conversations-toggle="true"]');
        if (toggle) {
            const parent = toggle.parentElement;
            if (parent) {
                const children = Array.from(parent.children).filter(c => c.offsetWidth > 0);
                const toggleIdx = children.indexOf(toggle);
                // Plus icon is right before history
                if (toggleIdx > 0) {
                    const plusBtn = children[toggleIdx - 1];
                    plusBtn.click();
                    return 'clicked (sibling of toggle)';
                }
            }
        }

        // ─── 2. SVG path based: Plus(+) shape SVG ───
        const panel = document.querySelector('.antigravity-agent-side-panel') || document.querySelector('#conversation');
        if (panel) {
            const svgs = panel.querySelectorAll('svg');
            for (const svg of svgs) {
                const path = svg.querySelector('path');
                if (path) {
                    const d = path.getAttribute('d') || '';
 // Plus icon SVG: + 
                    if (d.includes('v15') && d.includes('h-15')) {
                        const clickable = svg.closest('a') || svg.closest('button') || svg.parentElement;
                        if (clickable) {
                            clickable.click();
                            return 'clicked (svg plus)';
                        }
                    }
                }
            }
        }

 // ─── 3. fallback: panel area <a> ───
        if (panel) {
            const topLinks = Array.from(panel.querySelectorAll('a')).filter(a => {
                const r = a.getBoundingClientRect();
                const pr = panel.getBoundingClientRect();
                return r.y < pr.y + 30 && a.offsetWidth > 0 && a.offsetWidth < 30;
            });
            if (topLinks.length > 0) {
                topLinks[0].click();
                return 'clicked (first top link)';
            }
        }

        return 'no new session button found';
    } catch (e) {
        return 'error: ' + e.message;
    }
})()
