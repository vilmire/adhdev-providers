/**
 * PearAI — webview_set_mode
 * ${ MODE }
 */
(async () => {
    try {
        const target = String(${ MODE }).trim().toLowerCase();
        const knownModes = ['💻 code', '🏗️ architect', '❓ ask', '🪲 debug', 'code', 'architect', 'ask', 'debug'];
        const trigger = Array.from(document.querySelectorAll('button[data-testid="dropdown-trigger"], button[title], button'))
            .find((button) => /select mode for interaction/i.test(button.getAttribute('title') || ''));

        if (!trigger) {
            return JSON.stringify({ success: false, error: 'mode trigger not found' });
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
                    && text.length < 40;
            });

        const match = options.find((node) => {
            const text = (node.textContent || '').trim().toLowerCase();
            return knownModes.includes(text) && (text === target || text.includes(target));
        });

        if (!match) {
            const current = (trigger.textContent || '').trim();
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            if (current.toLowerCase() === target || current.toLowerCase().includes(target)) {
                return JSON.stringify({ success: true, mode: current });
            }
            return JSON.stringify({ success: false, error: 'mode not found: ' + target });
        }

        match.click();
        await new Promise((resolve) => setTimeout(resolve, 200));
        return JSON.stringify({ success: true, mode: (match.textContent || '').trim() });
    } catch (error) {
        return JSON.stringify({ success: false, error: String(error && error.message || error) });
    }
})()
