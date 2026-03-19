/**
 * Antigravity — list_models
 * 모델 드롭다운 트리거 버튼 + 항목 목록 추출
 * Updated for Antigravity v0.x+ DOM (Tailwind arbitrary value classes)
 * → { models: string[], current: string }
 */
(() => {
    try {
        const models = [];
        let current = '';

        // 1. 드롭다운이 열린 상태: 항목 목록 추출
        //    셀렉터: px-2 py-1 flex items-center justify-between cursor-pointer hover:bg-gray-500/10
        const items = document.querySelectorAll('.px-2.py-1.flex.items-center.justify-between.cursor-pointer');
        for (const item of items) {
            const label = item.querySelector('.text-xs.font-medium');
            const text = (label || item).textContent?.trim();
            if (!text || text.length > 60) continue;
            models.push(text);
            // 선택된 항목: bg-gray-500/20
            if ((item.className || '').includes('bg-gray-500/20')) {
                current = text;
            }
        }

        // 2. 드롭다운 닫힌 상태: 트리거 버튼에서 현재 모델 추출
        //    flex min-w-0 max-w-full cursor-pointer items-center ... (arbitrary value 포함)
        if (models.length === 0) {
            const trigger = [...document.querySelectorAll('div, button')].find(e => {
                const cls = e.className || '';
                return cls.includes('min-w-0') && cls.includes('max-w-full') && cls.includes('cursor-pointer') && cls.includes('items-center') && e.offsetWidth > 0;
            });
            if (trigger) {
                const span = trigger.querySelector('span.text-xs');
                current = (span || trigger).textContent?.trim() || '';
            }
        }

        return JSON.stringify({ models, current });
    } catch (e) {
        return JSON.stringify({ models: [], current: '', error: e.message });
    }
})()
