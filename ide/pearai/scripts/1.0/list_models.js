/**
 * PearAI — webview_list_models
 */
(async () => {
    try {
        const knownModelPattern = /default|gpt|claude|gemini|sonnet|haiku|o1|o3|4\.1|3\.7/i;
        const trigger = Array.from(document.querySelectorAll('button[data-testid="dropdown-trigger"], button[title], button'))
            .find((button) => /select api configuration/i.test(button.getAttribute('title') || ''));

        if (!trigger) {
            return JSON.stringify({ models: [], current: '', error: 'model trigger not found' });
        }

        const current = (trigger.textContent || '').trim();
        trigger.click();
        await new Promise((resolve) => setTimeout(resolve, 250));

        const options = Array.from(document.querySelectorAll('[role="option"], [cmdk-item], [data-radix-collection-item], [data-state], button, div, span'))
            .filter((node) => {
                const rect = node.getBoundingClientRect();
                const text = (node.textContent || '').trim();
                return rect.width > 0
                    && rect.height > 0
                    && text
                    && text.length < 80
                    && !node.querySelector('textarea')
                    && node.querySelectorAll('button').length === 0
                    && node.children.length <= 2;
            });

        const models = [];
        for (const option of options) {
            const text = (option.textContent || '').trim();
            if (!text || text === current) continue;
            if (knownModelPattern.test(text)) {
                models.push(text);
            }
        }

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return JSON.stringify({ models: [...new Set([current, ...models].filter(Boolean))], current });
    } catch (error) {
        return JSON.stringify({ models: [], current: '', error: String(error && error.message || error) });
    }
})()
