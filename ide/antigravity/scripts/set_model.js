/**
 * Antigravity — set_model
 * 모델 드롭다운에서 모델 선택
 * Updated for Antigravity v0.x+ DOM (Tailwind arbitrary value classes)
 * ${MODEL} → JSON.stringify(modelName)
 * → { success: boolean, model?: string }
 */
(async () => {
    try {
        const target = ${MODEL};

        // 1. 드롭다운이 열린 상태: 항목 직접 클릭
        const items = document.querySelectorAll('.px-2.py-1.flex.items-center.justify-between.cursor-pointer');
        for (const item of items) {
            const label = item.querySelector('.text-xs.font-medium');
            const text = (label || item).textContent?.trim();
            if (text && (text === target || text.toLowerCase().includes(target.toLowerCase()))) {
                item.click();
                await new Promise(r => setTimeout(r, 200));
                return JSON.stringify({ success: true, model: text });
            }
        }

        // 2. 드롭다운 닫힌 상태: 트리거 버튼 찾아서 클릭
        const trigger = [...document.querySelectorAll('div, button')].find(e => {
            const cls = e.className || '';
            return cls.includes('min-w-0') && cls.includes('max-w-full') && cls.includes('cursor-pointer') && cls.includes('items-center') && e.offsetWidth > 0;
        });
        if (trigger) {
            trigger.click();
            await new Promise(r => setTimeout(r, 400));

            // 다시 항목 탐색
            const newItems = document.querySelectorAll('.px-2.py-1.flex.items-center.justify-between.cursor-pointer');
            for (const item of newItems) {
                const label = item.querySelector('.text-xs.font-medium');
                const text = (label || item).textContent?.trim();
                if (text && (text === target || text.toLowerCase().includes(target.toLowerCase()))) {
                    item.click();
                    return JSON.stringify({ success: true, model: text });
                }
            }
            // 못 찾으면 닫기
            trigger.click();
        }

        return JSON.stringify({ success: false, error: 'model not found: ' + target });
    } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
    }
})()
