/**
 * Antigravity — set_mode
 * Conversation mode 버튼 / 패널에서 Planning/Fast 선택
 * Updated for Antigravity v0.x+ DOM
 * ${MODE} → JSON.stringify(modeName)
 * → { success: boolean, mode?: string }
 */
(async () => {
    try {
        const target = ${MODE};

        // 1. 드롭다운이 열린 상태: "Conversation mode" 패널에서 항목 클릭
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

        // 2. 드롭다운 닫힌 상태: 현재 모드 버튼 클릭해서 드롭다운 열기
        const modeBtn = [...document.querySelectorAll('button')].find(b => {
            const cls = b.className || '';
            return cls.includes('py-1') && cls.includes('pl-1') && cls.includes('pr-2') && cls.includes('opacity-70') && b.offsetWidth > 0;
        });
        if (modeBtn) {
            modeBtn.click();
            await new Promise(r => setTimeout(r, 400));

            // 다시 패널 탐색
            const hdrs2 = document.querySelectorAll('.text-xs.px-2.pb-1.opacity-80');
            for (const h of hdrs2) {
                if (h.textContent?.trim() === 'Conversation mode') {
                    const p = h.parentElement;
                    if (!p) continue;
                    const items = p.querySelectorAll('.font-medium');
                    for (const item of items) {
                        const text = item.textContent?.trim();
                        if (text && text.toLowerCase() === target.toLowerCase()) {
                            item.click();
                            return JSON.stringify({ success: true, mode: text });
                        }
                    }
                    break;
                }
            }
            // 찾지 못하면 닫기
            modeBtn.click();
        }

        return JSON.stringify({ success: false, error: 'mode not found: ' + target });
    } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
    }
})()
