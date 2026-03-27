/**
 * Windsurf v1 — resolve_action
 * 
 * Cascade 패널 내의 승인/거절 버튼을 찾아 좌표를 반환합니다.
 */
(async (params) => {
    try {
        const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
        
        // 검색할 핵심 단어
        const want = normalize(params?.buttonText || params?.button || params?.action || 'run');
        
        const isMatch = (text) => {
            const t = normalize(text);
            if (!t) return false;
            // 긍정 액션 (Run / Accept)
            if (want === 'run' || want === 'approve' || want === 'accept') {
                return /run|allow|approve|accept|apply|ok|yes|proceed|continue|keep/i.test(t);
            }
            // 부정 액션 (Skip / Reject)
            if (want === 'skip' || want === 'reject' || want === 'deny') {
                return /skip|deny|reject|cancel|no|discard/i.test(t);
            }
            return t.includes(want);
        };

        const isVisible = (el) => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && 
                   window.getComputedStyle(el).visibility !== 'hidden' &&
                   window.getComputedStyle(el).display !== 'none';
        };

        const cascade = document.querySelector('#windsurf\\.cascadePanel') || document.querySelector('.chat-client-root') || document;
        
        // 모든 버튼 수집
        const buttons = Array.from(cascade.querySelectorAll('button, [role="button"], .monaco-button'))
            .filter(el => isVisible(el) && !el.disabled && !el.classList.contains('disabled'));

        // 가장 아래(최신)에 있는 버튼 우선
        const target = buttons.reverse().find(el => {
            const label = el.innerText || el.textContent || el.getAttribute('aria-label') || '';
            return isMatch(label);
        });

        if (target) {
            target.focus?.();
            const rect = target.getBoundingClientRect();
            
            // Synthetic click (DOM 수준)
            try { 
                const init = { bubbles: true, cancelable: true, view: window, buttons: 1 };
                target.dispatchEvent(new MouseEvent('mousedown', init));
                target.dispatchEvent(new MouseEvent('mouseup', init));
                target.click(); 
            } catch(e) {}
            
            return JSON.stringify({
                found: true,
                x: Math.round(rect.x + rect.width / 2),
                y: Math.round(rect.y + rect.height / 2),
                label: (target.innerText || target.textContent || '').trim()
            });
        }

        // 버튼 상호작용 실패 시 Enter 시도 (긍정 액션인 경우)
        if (want === 'run' || want === 'approve' || want === 'accept') {
            const cmdEnter = (type) => document.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, metaKey: true, bubbles: true, cancelable: true }));
            cmdEnter('keydown');
            await wait(20);
            cmdEnter('keyup');
            return JSON.stringify({ resolved: true, method: 'cmd_enter_fallback' });
        }

        return JSON.stringify({ found: false });
    } catch (e) {
        return JSON.stringify({ found: false, error: e.message });
    }
})


