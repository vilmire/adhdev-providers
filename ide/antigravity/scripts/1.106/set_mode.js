/**
 * Antigravity — set_mode
 * Conversation mode 패널에서 Planning/Fast 클릭
 * ${MODE} → JSON.stringify(modeName)
 * → { success: boolean, mode?: string }
 */
(async () => {
    try {
        const target = ${MODE};

        // "Conversation mode" 헤더의 부모에서 .font-medium 항목 찾기
        const headers = document.querySelectorAll('.text-xs.px-2.pb-1.opacity-80');
        for (const header of headers) {
            if (header.textContent?.trim() === 'Conversation mode') {
                const parent = header.parentElement;
                if (!parent) continue;
                const items = parent.querySelectorAll('.font-medium');
                for (const item of items) {
                    const text = item.textContent?.trim();
                    if (text && text.toLowerCase() === target.toLowerCase()) {
                        item.click();
                        await new Promise(r => setTimeout(r, 300));
                        return JSON.stringify({ success: true, mode: text });
                    }
                }
                break;
            }
        }

        return JSON.stringify({ success: false, error: 'mode not found: ' + target });
    } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
    }
})()
