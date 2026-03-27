/**
 * Generic fallback — list_models
 */
(async () => {
    try {
        const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        const cascade = document.querySelector('#windsurf\\.cascadePanel') || document.querySelector('.chat-client-root');
        if (!cascade) {
            return JSON.stringify({ modes: [], current: '' });
        }

        const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim();
        const getModeButton = () => {
            const buttons = Array.from(cascade.querySelectorAll('button')).filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);
            return buttons.find(el => {
                const rect = el.getBoundingClientRect();
                return rect.y > window.innerHeight - 90 && /lucide-code|lucide-message|lucide-search|lucide-wand|lucide-pencil/i.test(el.innerHTML);
            }) || null;
        };
        const inferCurrent = (button) => {
            if (!button) return '';
            if (/lucide-code/i.test(button.innerHTML)) return 'Code';
            if (/lucide-message/i.test(button.innerHTML)) return 'Ask';
            if (/lucide-search/i.test(button.innerHTML)) return 'Search';
            if (/lucide-pencil|lucide-pen|lucide-wand/i.test(button.innerHTML)) return 'Write';
            return '';
        };
        const getMenuButtons = () => Array.from(document.querySelectorAll('button')).filter(el => {
            if (!(el.offsetWidth > 0 && el.offsetHeight > 0)) return false;
            const rect = el.getBoundingClientRect();
            const text = normalize(el.innerText || el.textContent);
            return rect.x > window.innerWidth - 320 && rect.width >= 180 && /^(Code|Ask|Search|Write)\b/i.test(text);
        });

        const modeButton = getModeButton();
        const current = inferCurrent(modeButton);
        const wasOpen = getMenuButtons().length > 0;

        if (!wasOpen && modeButton) {
            modeButton.click();
            await wait(200);
        }

        const modes = [];
        const seen = new Set();
        for (const button of getMenuButtons()) {
            const name = normalize((button.innerText || button.textContent || '').split('\n')[0]);
            if (!name) continue;
            const key = name.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            modes.push({ name, id: key });
        }

        if (!wasOpen) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));
        }

        return JSON.stringify({ modes, current });
    } catch (e) {
        return JSON.stringify({ modes: [], current: '', error: e.message });
    }
})()
