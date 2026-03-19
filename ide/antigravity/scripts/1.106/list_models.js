/**
 * Antigravity — list_models
 * antigravity-agent-side-panel 내부 모델 드롭다운에서 목록 + 현재 모델 추출
 * → { models: string[], current: string }
 */
(() => {
    try {
        const models = [];
        let current = '';

        // 1. 모델 항목에서 목록 추출
        //    셀렉터: .px-2.py-1.flex.items-center.justify-between.cursor-pointer
        const items = document.querySelectorAll('.px-2.py-1.flex.items-center.justify-between.cursor-pointer');
        for (const item of items) {
            const label = item.querySelector('.text-xs.font-medium');
            const text = (label || item).textContent?.trim();
            if (!text || text.length > 60) continue;
            // 모델명 검증 (Claude, Gemini, GPT, etc.)
            models.push(text);
            // 선택된 항목: bg-gray-500/20
            if ((item.className || '').includes('bg-gray-500/20')) {
                current = text;
            }
        }

        // 2. 모델 목록이 없으면 (드롭다운 닫힘) → 트리거 버튼에서 현재 모델만
        if (models.length === 0) {
            const trigger = document.querySelector('.flex.min-w-0.max-w-full.cursor-pointer.items-center');
            if (trigger) {
                current = trigger.textContent?.trim() || '';
            }
        }

        return JSON.stringify({ models, current });
    } catch (e) {
        return JSON.stringify({ models: [], current: '', error: e.message });
    }
})()
