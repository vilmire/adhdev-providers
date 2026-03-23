/**
 * Kiro — open_panel
 *
 * Kiro AI 채팅 패널 열기.
 * Secondary Side Bar (#workbench.parts.auxiliarybar)에 위치.
 * "Toggle Secondary Side Bar (⌥⌘B)" 또는 "Kiro" 버튼으로 열기.
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

        // 2. Toggle 버튼 클릭 시도
        const toggleBtns = Array.from(document.querySelectorAll('li.action-item a, button, [role="button"]'));
        for (const btn of toggleBtns) {
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (label.includes('toggle secondary') || label.includes('toggle auxiliary') ||
                label === 'kiro' || label.includes('kiro')) {
                if (btn.offsetWidth > 0 || btn.offsetHeight > 0) {
                    btn.click();
                    return 'opened (toggle)';
                }
            }
        }

        // 3. Cmd+Shift+I 단축키 폴백 (Kiro 기본 단축키)
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'b', code: 'KeyB', keyCode: 66,
            metaKey: true, altKey: true, ctrlKey: false,
            bubbles: true, cancelable: true,
        }));
        document.dispatchEvent(new KeyboardEvent('keyup', {
            key: 'b', code: 'KeyB', keyCode: 66,
            metaKey: true, altKey: true, ctrlKey: false,
            bubbles: true, cancelable: true,
        }));

        return 'opened (⌥⌘B)';
    } catch (e) {
        return 'error: ' + e.message;
    }
})()
