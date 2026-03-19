/**
 * Antigravity — list_modes
 * Conversation mode: Planning / Fast 세그먼트 컨트롤
 * inputBox 근처의 "Conversation mode" 패널에서 읽기
 * → { modes: string[], current: string }
 */
(() => {
    try {
        const modes = [];
        let current = '';

        // "Conversation mode" 헤더를 포함하는 패널 찾기
        const headers = document.querySelectorAll('.text-xs.px-2.pb-1.opacity-80');
        for (const header of headers) {
            if (header.textContent?.trim() === 'Conversation mode') {
                // 형제 요소들에서 모드 항목 추출
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

        // 현재 모드: Fast 버튼의 텍스트 (현재 활성 모드 표시)
        const modeBtn = [...document.querySelectorAll('button')].find(b => {
            const cls = b.className || '';
            return cls.includes('py-1') && cls.includes('pl-1') && cls.includes('pr-2') && b.offsetWidth > 0;
        });
        if (modeBtn) {
            current = modeBtn.textContent?.trim() || '';
        }

        // modes가 비어있으면 기본값
        if (modes.length === 0) {
            modes.push('Planning', 'Fast');
        }

        return JSON.stringify({ modes, current });
    } catch (e) {
        return JSON.stringify({ modes: [], current: '', error: e.message });
    }
})()
