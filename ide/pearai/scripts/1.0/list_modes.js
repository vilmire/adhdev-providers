/**
 * PearAI — webview_list_modes
 */
(async () => {
    try {
        const knownModes = ['💻 Code', '🏗️ Architect', '❓ Ask', '🪲 Debug'];
        const trigger = Array.from(document.querySelectorAll('button[data-testid="dropdown-trigger"], button[title], button'))
            .find((button) => /select mode for interaction/i.test(button.getAttribute('title') || ''));

        if (!trigger) {
            return JSON.stringify({ modes: [], current: '', error: 'mode trigger not found' });
        }

        const current = (trigger.textContent || '').trim();
        trigger.click();
        await new Promise((resolve) => setTimeout(resolve, 250));

        const options = Array.from(document.querySelectorAll('[role="option"], [cmdk-item], [data-radix-collection-item], [data-state], button, div, span'))
            .filter((node) => {
                const rect = node.getBoundingClientRect();
                const text = (node.textContent || '').trim();
                return node !== trigger
                    && !trigger.contains(node)
                    && rect.width > 0
                    && rect.height > 0
                    && text
                    && text.length < 40;
            });

        const modes = [];
        for (const option of options) {
            const text = (option.textContent || '').trim();
            if (!text || text === current) continue;
            if (knownModes.includes(text)) {
                modes.push(text);
            }
        }

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return JSON.stringify({ modes: [...new Set([current, ...knownModes, ...modes].filter(Boolean))], current });
    } catch (error) {
        return JSON.stringify({ modes: [], current: '', error: String(error && error.message || error) });
    }
})()
