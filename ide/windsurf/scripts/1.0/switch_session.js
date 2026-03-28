/**
 * Windsurf v1 — switch_session
 * 
 * Cascade session(conversation) .
 * 1. top tabs ([id^="cascade-tab-"])
 * 2. history panel ([data-kb-navigate="true"])
 */
(async (params) => {
    try {
        const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
        
        const clickSequence = (el) => {
            if (!el) return;
            const rect = el.getBoundingClientRect();
            // 1. Synthetic Dispatch
            const init = { bubbles: true, cancelable: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, pointerId: 1, pointerType: 'mouse' };
            el.focus?.();
            for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
                el.dispatchEvent(new PointerEvent(type, init));
            }
            // 2. Native click()
            try { el.click(); } catch(e) {}
            
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        };

        const id = params?.id || '';
        const title = normalize(params?.title || '');
        const index = Number.isFinite(params?.index) ? params.index : null;

        let target = null;

 // 1. ID search (top tabs first)
        if (id) {
            target = document.getElementById(`cascade-tab-${id}`) || document.getElementById(id);
        }

 // 2. top tabsfrom title search
        if (!target && title) {
            const tabs = Array.from(document.querySelectorAll('[id^="cascade-tab-"]'));
            target = tabs.find(tab => normalize(tab.textContent).includes(title));
        }

        // 3. history panelfrom search
        if (!target) {
            const cascade = document.querySelector('#windsurf\\.cascadePanel') || document.querySelector('.chat-client-root');
            if (cascade) {
                const historyButton = Array.from(cascade.querySelectorAll('button')).find(el => el.offsetWidth > 0 && /lucide-history/.test(el.innerHTML || ''));
                if (historyButton) {
                    historyButton.click();
                    await wait(350);
                }
                
                const rows = Array.from(document.querySelectorAll('[data-kb-navigate="true"]')).filter(el => el.offsetWidth > 0);
                if (title) {
                    target = rows.find(row => normalize(row.textContent).includes(title));
                }
                if (!target && index !== null) {
                    target = rows[index];
                }
            }
        }

        if (!target) {
            // Close history panel
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));
            return JSON.stringify({ switched: false, error: 'Session not found among visible tabs or history rows' });
        }

        const coords = clickSequence(target.querySelector('.cursor-pointer') || target);
        await wait(200);

 // Close history panel ( )
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));

        return JSON.stringify({ switched: true, coords });
    } catch (e) {
        return JSON.stringify({ switched: false, error: e.message });
    }
})

