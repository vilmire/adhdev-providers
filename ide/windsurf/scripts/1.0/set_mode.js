/**
 * Generic fallback — set_model
 * ${ MODEL }
 */
(async (params) => {
    try {
        const want = (params?.mode || '').trim();
        if (!want) {
            return JSON.stringify({ success: false, error: 'Missing mode' });
        }

        const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        const cascade = document.querySelector('#windsurf\\.cascadePanel') || document.querySelector('.chat-client-root');
        const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const modeButton = Array.from((cascade || document).querySelectorAll('button')).find(el => {
            const rect = el.getBoundingClientRect();
            return rect.y > window.innerHeight - 90 && /lucide-code|lucide-message|lucide-search|lucide-wand|lucide-pencil/i.test(el.innerHTML || '');
        });

        if (modeButton) {
            modeButton.click();
            await wait(200);
        }

        const target = Array.from(document.querySelectorAll('button')).find(el => {
            if (!(el.offsetWidth > 0 && el.offsetHeight > 0)) return false;
            const rect = el.getBoundingClientRect();
            const text = normalize((el.innerText || el.textContent || '').split('\n')[0]);
            return rect.x > window.innerWidth - 320 && rect.width >= 180 && (text === normalize(want) || text.includes(normalize(want)) || normalize(want).includes(text));
        });

        if (!target) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));
            return JSON.stringify({ success: false, error: 'Mode not found' });
        }

        target.click();
        await wait(200);
        return JSON.stringify({ success: true });
    } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
    }
})
