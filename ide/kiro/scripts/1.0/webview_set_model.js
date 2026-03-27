/**
 * Kiro — webview_set_model
 * 파라미터: ${ MODEL }
 */
(async () => {
    try {
        const want = ${ MODEL } || '';
        const norm = (t) => (t || '').toLowerCase().trim();

        if (!want) return JSON.stringify({ success: false, error: 'No model specified' });

        const trigger = document.querySelector('.kiro-dropdown-trigger');
        if (!trigger) return JSON.stringify({ success: false, error: 'Trigger not found' });

        const current = norm(trigger.querySelector('.kiro-dropdown-selected-text')?.textContent);
        if (current === norm(want) || current.includes(norm(want))) {
            return JSON.stringify({ success: true, already: true });
        }

        const wasExpanded = trigger.getAttribute('aria-expanded') === 'true';
        if (!wasExpanded) {
            trigger.click();
            await new Promise(r => setTimeout(r, 150));
        }

        const items = document.querySelectorAll('.kiro-dropdown-item, [role="menuitem"], [role="option"]');
        let found = null;
        for (const item of items) {
            const txt = norm(item.textContent);
            if (txt === norm(want) || txt.includes(norm(want)) || norm(want).includes(txt)) {
                found = item;
                break;
            }
        }

        if (found) {
            found.click();
            return JSON.stringify({ success: true });
        }

        if (!wasExpanded) trigger.click(); // Close if we opened but didn't find

        return JSON.stringify({ success: false, error: 'Model not found in list' });
    } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
    }
})()
