/**
 * Generic fallback — list_models
 */
(() => {
    try {
        const models = [];
        let current = '';

        // Try generic Model string from select/button
        const sel = document.querySelectorAll('select, [class*="model"], [id*="model"]');
        for (const el of sel) {
            const txt = (el.textContent || '').trim();
            if (txt && /claude|gpt|gemini|sonnet|opus/i.test(txt)) {
                if (txt.length < 50) {
                    models.push(txt);
                    if (!current) current = txt;
                }
            }
        }

        if (models.length === 0) {
            const btns = document.querySelectorAll('button');
            for (const b of btns) {
                const txt = (b.textContent || '').trim();
                if (txt && /claude|gpt|gemini|sonnet/i.test(txt) && txt.length < 30) {
                    models.push(txt);
                    current = txt;
                }
            }
        }

        return JSON.stringify({ 
            models: [...new Set(models)], 
            current: current || 'Default' 
        });
    } catch (e) {
        return JSON.stringify({ models: [], current: '', error: e.message });
    }
})()
