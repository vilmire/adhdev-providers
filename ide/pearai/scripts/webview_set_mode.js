/**
 * Cline — set_mode
 * 모드 selector에서 지정된 모드 선택
 * ${MODE} → JSON.stringify(modeName)
 * → { success: boolean }
 */
(async () => {
    try {
        const inner = document.querySelector('iframe');
        const doc = inner?.contentDocument || inner?.contentWindow?.document;
        if (!doc) return JSON.stringify({ success: false, error: 'no doc' });

        const target = ${MODE};
        const trigger = doc.querySelector('[data-testid="mode-selector-trigger"], [data-testid="mode-switch"]');
        if (!trigger) return JSON.stringify({ success: false, error: 'no mode trigger' });

        // 드롭다운 열기
        trigger.click();
        await new Promise(r => setTimeout(r, 300));

        // 옵션에서 타겟 모드 찾기
        const options = doc.querySelectorAll('[data-testid*="mode-option"], [role="option"], [class*="dropdown"] [class*="item"], [class*="listbox"] [class*="option"]');
        for (const opt of options) {
            const text = (opt.textContent || '').trim();
            if (text === target || text.toLowerCase().includes(target.toLowerCase())) {
                opt.click();
                await new Promise(r => setTimeout(r, 200));
                return JSON.stringify({ success: true, mode: text });
            }
        }

        // 닫기
        doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return JSON.stringify({ success: false, error: 'mode not found: ' + target });
    } catch (e) { return JSON.stringify({ success: false, error: e.message }); }
})()
