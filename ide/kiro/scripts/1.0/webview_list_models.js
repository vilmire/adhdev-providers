/**
 * Kiro — webview_list_models
 */
(async () => {
    try {
        const trigger = document.querySelector('.kiro-dropdown-trigger');
        if (!trigger) {
            return JSON.stringify({ models: [], current: 'Default', error: 'No dropdown found' });
        }

        const current = (trigger.querySelector('.kiro-dropdown-selected-text')?.textContent || '').trim();

        // Check if menu is already open
        const wasExpanded = trigger.getAttribute('aria-expanded') === 'true';

        if (!wasExpanded) {
            trigger.click();
            await new Promise(r => setTimeout(r, 150));
        }

        const models = [];
        const items = document.querySelectorAll('.kiro-dropdown-item, [role="menuitem"], [role="option"]');
        for (const item of items) {
            const txt = (item.textContent || '').trim();
            if (txt && txt.length < 50) {
                models.push(txt);
            }
        }

        // Close menu
        if (!wasExpanded) {
            trigger.click();
        }

        return JSON.stringify({ 
            models: [...new Set(models)], 
            current: current || 'Default' 
        });
    } catch (e) {
        return JSON.stringify({ models: [], current: '', error: e.message });
    }
})()
