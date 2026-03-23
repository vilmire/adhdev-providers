/**
 * Trae — open_panel
 *
 * Trae AI 채팅 패널 열기.
 * "TRAE" 버튼 또는 ⌘L 단축키로 열기.
 *
 * 반환: 'visible' | 'opened' | 'error: ...'
 */
(() => {
    try {
        // 1. 이미 열려 있는지 확인
        const sidebar = document.getElementById('workbench.parts.auxiliarybar');
        if (sidebar && sidebar.offsetWidth > 0 && sidebar.offsetHeight > 0) {
            return 'visible';
        }

        // 2. "TRAE" 버튼 클릭 시도
        const toggleBtns = Array.from(document.querySelectorAll('li.action-item a, button, [role="button"]'));
        for (const btn of toggleBtns) {
            const label = (btn.getAttribute('aria-label') || '');
            if (label === 'TRAE' || label.toLowerCase().includes('toggle secondary') ||
                label.toLowerCase().includes('toggle auxiliary')) {
                btn.click();
                return 'opened (toggle)';
            }
        }

        // 3. Cmd+L 단축키 폴백 (Trae 기본 단축키)
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'l', code: 'KeyL', keyCode: 76,
            metaKey: true, ctrlKey: false,
            bubbles: true, cancelable: true,
        }));
        document.dispatchEvent(new KeyboardEvent('keyup', {
            key: 'l', code: 'KeyL', keyCode: 76,
            metaKey: true, ctrlKey: false,
            bubbles: true, cancelable: true,
        }));

        return 'opened (⌘L)';
    } catch (e) {
        return 'error: ' + e.message;
    }
})()
