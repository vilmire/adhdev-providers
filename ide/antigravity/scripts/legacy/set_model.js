/**
 * Antigravity — set_model
 * antigravity-agent-side-panel 모델 드롭다운에서 모델 선택
 * ${MODEL} → JSON.stringify(modelName)
 * → { success: boolean, model?: string }
 */
(async () => {
    try {
        const target = ${MODEL};

        // 1. 모델 드롭다운이 열려 있는 경우 → 직접 선택
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

        // 2. 드롭다운이 닫혀 있으면 → 트리거 버튼 클릭해서 열기
        const trigger = document.querySelector('.flex.min-w-0.max-w-full.cursor-pointer.items-center');
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
            // 못 찾으면 드롭다운 닫기
            trigger.click();
        }

        return JSON.stringify({ success: false, error: 'model not found: ' + target });
    } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
    }
})()
