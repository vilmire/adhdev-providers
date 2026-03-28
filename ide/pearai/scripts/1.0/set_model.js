/**
 * PearAI — webview_set_model
 * ${ MODEL }
 */
(async () => {
    try {
        const target = String(${ MODEL }).trim().toLowerCase();
        const knownModelPattern = /default|gpt|claude|gemini|sonnet|haiku|o1|o3|4\.1|3\.7/i;
        const trigger = Array.from(document.querySelectorAll('button[data-testid="dropdown-trigger"], button[title], button'))
            .find((button) => /select api configuration/i.test(button.getAttribute('title') || ''));

        if (!trigger) {
            return JSON.stringify({ success: false, error: 'model trigger not found' });
        }

        trigger.click();
        await new Promise((resolve) => setTimeout(resolve, 250));

        const options = Array.from(document.querySelectorAll('[role="option"], [cmdk-item], [data-radix-collection-item], button, div, span'))
            .filter((node) => {
                const rect = node.getBoundingClientRect();
                const text = (node.textContent || '').trim();
                return node !== trigger
                    && !trigger.contains(node)
                    && rect.width > 0
                    && rect.height > 0
                    && text
                    && text.length < 80
                    && !node.querySelector('textarea')
                    && node.querySelectorAll('button').length === 0
                    && node.children.length <= 2;
            });

        const match = options.find((node) => {
            const text = (node.textContent || '').trim().toLowerCase();
            return knownModelPattern.test(text) && (text === target || text.includes(target));
        });

        if (!match) {
            const current = (trigger.textContent || '').trim();
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            if (current.toLowerCase() === target || current.toLowerCase().includes(target)) {
                return JSON.stringify({ success: true, model: current });
            }
            return JSON.stringify({ success: false, error: 'model not found: ' + target });
        }

        match.click();
        await new Promise((resolve) => setTimeout(resolve, 200));
        return JSON.stringify({ success: true, model: (match.textContent || '').trim() });
    } catch (error) {
        return JSON.stringify({ success: false, error: String(error && error.message || error) });
    }
})()
