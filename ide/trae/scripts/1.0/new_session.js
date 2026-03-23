/**
 * Trae — new_session
 *
 * "New Task" 생성 (⌃⌘N 단축키 또는 버튼 클릭).
 * Trae는 메인 DOM에서 접근 가능.
 */
(() => {
    try {
        // 버튼 찾기
        const buttons = document.querySelectorAll('button, [role="button"], .action-item a');
        for (const btn of buttons) {
            const text = (btn.textContent || '').trim();
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (text.includes('New Task') || label.includes('new task') || label.includes('new chat')) {
                btn.click();
                return JSON.stringify({ created: true, method: 'button' });
            }
        }

        // 단축키 폴백: ⌃⌘N
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'n', code: 'KeyN', keyCode: 78,
            metaKey: true, ctrlKey: true,
            bubbles: true, cancelable: true,
        }));
        return JSON.stringify({ created: true, method: 'shortcut' });
    } catch (e) {
        return JSON.stringify({ created: false, error: e.message });
    }
})()
