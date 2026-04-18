/**
 * Antigravity — list_models
 * model button + list extract
 *
 * Version compatibility:
 *   v0 (old): .flex.min-w-0.max-w-full.cursor-pointer.items-center (exact CSS selector works)
 *   v1 (new): Tailwind arbitrary values (pl-[0.125rem]) — must use partial class matching
 *   Both: dropdown items use .px-2.py-1.flex.items-center.justify-between.cursor-pointer
 *
 * → { models: string[], current: string }
 */
(() => {
    try {
        const models = [];
        let current = '';
        const seen = new Set();
        const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
        const isLikelyModelLabel = (value) => /^(Claude|Gemini|GPT|o\d|DeepSeek|Qwen|Mistral|Llama|Grok)\b/i.test(value)
            || /\b(Opus|Sonnet|Haiku|Flash|Pro|Mini|Thinking|Turbo|Max|OSS)\b/i.test(value);

        // ── Step 1: Dropdown open state — extract item list ──────────────────
        // Selector works for both v0 and v1 (hover class changed but cursor-pointer persists)
        const items = document.querySelectorAll('.px-2.py-1.flex.items-center.justify-between.cursor-pointer');
        for (const item of items) {
            const label = item.querySelector('.text-xs.font-medium');
            const text = normalize((label || item).textContent || '');
            if (!text || text.length > 80 || !isLikelyModelLabel(text)) continue;
            if (!seen.has(text)) {
                seen.add(text);
                models.push(text);
            }
            // Selected item: bg-gray-500/20 (both v0 & v1)
            if ((item.className || '').includes('bg-gray-500/20')) {
                current = text;
            }
        }

        // ── Step 2: Dropdown closed — extract current model from trigger ──────
        if (models.length === 0 || !current) {
            // v0: exact class match works
            let trigger = document.querySelector('.flex.min-w-0.max-w-full.cursor-pointer.items-center');

            // v1: arbitrary Tailwind classes → partial matching
            if (!trigger || trigger.offsetWidth === 0) {
                trigger = [...document.querySelectorAll('div, button')].find(e => {
                    const cls = e.className || '';
                    return cls.includes('min-w-0') &&
                           cls.includes('max-w-full') &&
                           cls.includes('cursor-pointer') &&
                           cls.includes('items-center') &&
                           e.offsetWidth > 0;
                }) || null;
            }

            if (trigger) {
                // v0: .text-xs.font-medium span / v1: .text-xs span with opacity-70
                const span = trigger.querySelector('.text-xs.font-medium') ||
                             trigger.querySelector('span.text-xs') ||
                             trigger;
                const triggerText = normalize(span.textContent || '');
                if (isLikelyModelLabel(triggerText)) {
                    current = triggerText;
                    if (!seen.has(triggerText)) {
                        seen.add(triggerText);
                        models.unshift(triggerText);
                    }
                }
            }
        }

        return JSON.stringify({ models, current });
    } catch (e) {
        return JSON.stringify({ models: [], current: '', error: e.message });
    }
})()
