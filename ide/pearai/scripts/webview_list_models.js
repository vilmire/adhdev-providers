/**
 * Cline — list_models
 * 드롭다운에서 사용 가능한 모델 목록 + 현재 선택된 모델 반환
 * → { models: string[], current: string }
 */
(async () => {
    try {
        const inner = document.querySelector('iframe');
        const doc = inner?.contentDocument || inner?.contentWindow?.document;
        if (!doc) return JSON.stringify({ models: [], current: '', error: 'no doc' });

        // 현재 모델: mode-switch 또는 model selector에서 읽기
        let current = '';
        const modeSwitch = doc.querySelector('[data-testid="mode-switch"]');
        if (modeSwitch) current = (modeSwitch.textContent || '').trim();
        if (!current) {
            const modelSel = doc.querySelector('[data-testid*="model"], [aria-label*="model" i]');
            if (modelSel) current = (modelSel.textContent || '').trim();
        }

        // 드롭다운 트리거 찾기
        const trigger = doc.querySelector('[data-testid="model-selector"], [data-testid*="model-dropdown"], [data-testid="dropdown-trigger"]');
        if (!trigger) return JSON.stringify({ models: [], current, error: 'no model trigger' });

        // 드롭다운 열기
        trigger.click();
        await new Promise(r => setTimeout(r, 300));

        // 옵션 수집
        const options = doc.querySelectorAll('[data-testid*="dropdown-option"], [role="option"], [class*="dropdown"] [class*="item"], [class*="listbox"] [class*="option"]');
        const models = [];
        for (const opt of options) {
            const text = (opt.textContent || '').trim();
            if (text && text.length > 1 && text.length < 100) models.push(text);
        }

        // 닫기
        doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        if (trigger.click) trigger.click(); // fallback close

        return JSON.stringify({ models: [...new Set(models)], current });
    } catch (e) { return JSON.stringify({ models: [], current: '', error: e.message }); }
})()
