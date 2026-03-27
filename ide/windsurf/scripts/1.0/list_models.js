/**
 * Generic fallback — list_models
 */
(async () => {
    try {
        const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        const cascade = document.querySelector('#windsurf\\.cascadePanel') || document.querySelector('.chat-client-root');
        if (!cascade) {
            return JSON.stringify({ models: [], current: '' });
        }

        const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim();
        const modelRegex = /(claude|gpt|gemini|sonnet|opus|swe|deepseek|qwen|grok|o1|o3|codex)/i;
        const getCurrentButton = () => {
            const buttons = Array.from(cascade.querySelectorAll('button')).filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);
            const composerButtons = buttons.filter(el => el.getBoundingClientRect().y > window.innerHeight - 90);
            return composerButtons.find(el => {
                const text = normalize(el.innerText || el.textContent);
                return text && text.length <= 60 && modelRegex.test(text) && !/run|skip|accept|reject/i.test(text);
            }) || null;
        };
        const getMenuButtons = () => Array.from(document.querySelectorAll('button')).filter(el => {
            if (!(el.offsetWidth > 0 && el.offsetHeight > 0)) return false;
            const rect = el.getBoundingClientRect();
            const text = normalize(el.innerText || el.textContent);
            return rect.width >= 180 && rect.height >= 20 && rect.x > window.innerWidth - 320 && modelRegex.test(text);
        });

        const currentButton = getCurrentButton();
        const current = currentButton ? normalize(currentButton.innerText || currentButton.textContent) : '';
        const wasOpen = getMenuButtons().length > 0;

        if (!wasOpen && currentButton) {
            currentButton.click();
            await wait(250);
        }

        const models = getMenuButtons().map(el => normalize(el.innerText || el.textContent)).filter(Boolean);
        const unique = [];
        const seen = new Set();
        for (const name of models) {
            const key = name.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            unique.push({ name, id: key.replace(/[^a-z0-9]+/g, '-') });
        }

        if (!wasOpen) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));
        }

        return JSON.stringify({ models: unique, current });
    } catch (e) {
        return JSON.stringify({ models: [], current: '', error: e.message });
    }
})()
