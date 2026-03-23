/**
 * Cline — list_modes
 * 모드 selector에서 사용 가능한 모드 목록 + 현재 모드 반환
 * → { modes: string[], current: string }
 */
(async () => {
    try {
        const inner = document.querySelector('iframe');
        const doc = inner?.contentDocument || inner?.contentWindow?.document;
        if (!doc) return JSON.stringify({ modes: [], current: '', error: 'no doc' });

        // 현재 모드
        const trigger = doc.querySelector('[data-testid="mode-selector-trigger"], [data-testid="mode-switch"]');
        if (!trigger) return JSON.stringify({ modes: [], current: '', error: 'no mode trigger' });
        const current = (trigger.textContent || '').trim();

        // 드롭다운 열기
        trigger.click();
        await new Promise(r => setTimeout(r, 300));

        // 옵션 수집
        const options = doc.querySelectorAll('[data-testid*="mode-option"], [role="option"], [class*="dropdown"] [class*="item"], [class*="listbox"] [class*="option"]');
        const modes = [];
        for (const opt of options) {
            const text = (opt.textContent || '').trim();
            if (text && text.length > 1 && text.length < 50) modes.push(text);
        }

        // 닫기
        doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        if (trigger.click) trigger.click(); // fallback close

        return JSON.stringify({ modes: [...new Set(modes)], current });
    } catch (e) { return JSON.stringify({ modes: [], current: '', error: e.message }); }
})()
