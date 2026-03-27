/**
 * Generic fallback — set_model
 * ${ MODEL }
 */
(async (params) => {
    try {
        const want = (params?.model || '').trim();
        if (!want) {
            return JSON.stringify({ success: false, error: 'Missing model' });
        }

        const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        const cascade = document.querySelector('#windsurf\\.cascadePanel') || document.querySelector('.chat-client-root');
        const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const currentButton = Array.from((cascade || document).querySelectorAll('button')).find(el => {
            const rect = el.getBoundingClientRect();
            const text = (el.innerText || el.textContent || '').trim();
            return rect.y > window.innerHeight - 90 && rect.width < 140 && /(claude|gpt|gemini|sonnet|opus|swe|deepseek|qwen|grok|o1|o3|codex)/i.test(text);
        });

        if (currentButton) {
            currentButton.click();
            await wait(250);
        }

        const target = Array.from(document.querySelectorAll('button')).find(el => {
            if (!(el.offsetWidth > 0 && el.offsetHeight > 0)) return false;
            const rect = el.getBoundingClientRect();
            const text = normalize(el.innerText || el.textContent);
            return rect.x > window.innerWidth - 320 && rect.width >= 180 && (text === normalize(want) || text.includes(normalize(want)) || normalize(want).includes(text));
        });

        if (!target) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));
            return JSON.stringify({ success: false, error: 'Model not found' });
        }

        if ((target.className || '').includes('cursor-not-allowed') || target.disabled) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));
            return JSON.stringify({ success: false, error: 'Model is disabled' });
        }

        target.click();
        await wait(250);
        return JSON.stringify({ success: true });
    } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
    }
})
