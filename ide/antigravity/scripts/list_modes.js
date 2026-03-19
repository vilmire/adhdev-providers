/**
 * Antigravity — list_modes
 * 모드 버튼 (Fast / Planning) 목록 + 현재 모드 추출
 * Updated for Antigravity v0.x+ DOM
 * → { modes: string[], current: string }
 */
(() => {
    try {
        const modes = [];
        let current = '';

        // 현재 모드 버튼: py-1 pl-1 pr-2 flex items-center gap-0.5 rounded-md ... opacity-70
        // BUTTON 요소, 내부에 span.text-xs.select-none 있음
        const modeBtn = [...document.querySelectorAll('button')].find(b => {
            const cls = b.className || '';
            return cls.includes('py-1') && cls.includes('pl-1') && cls.includes('pr-2') && cls.includes('opacity-70') && b.offsetWidth > 0;
        });
        if (modeBtn) {
            current = modeBtn.textContent?.trim() || '';
        }

        // 모드 목록: "Conversation mode" 헤더를 포함하는 패널에서 추출
        const headers = document.querySelectorAll('.text-xs.px-2.pb-1.opacity-80');
        for (const header of headers) {
            if (header.textContent?.trim() === 'Conversation mode') {
                const parent = header.parentElement;
                if (!parent) continue;
                const items = parent.querySelectorAll('.font-medium');
                for (const item of items) {
                    const text = item.textContent?.trim();
                    if (text && text.length < 20) {
                        modes.push(text);
                    }
                }
                break;
            }
        }

        // 드롭다운 없을 때 인접 버튼 스캔
        if (modes.length === 0) {
            // 같은 컨테이너의 모든 버튼 스캔
            const container = modeBtn?.closest('.mt-1.flex, [class*="justify-between"]') || modeBtn?.parentElement?.parentElement;
            if (container) {
                const btns = container.querySelectorAll('button');
                for (const btn of btns) {
                    if (btn.offsetWidth > 0) {
                        const txt = btn.textContent?.trim();
                        if (txt && txt.length < 20) modes.push(txt);
                    }
                }
            }
        }

        // 최종 fallback
        if (modes.length === 0) {
            modes.push('Planning', 'Fast');
        }

        return JSON.stringify({ modes, current });
    } catch (e) {
        return JSON.stringify({ modes: [], current: '', error: e.message });
    }
})()
