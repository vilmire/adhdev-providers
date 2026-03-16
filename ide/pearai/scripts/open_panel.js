/**
 * PearAI — open_panel
 *
 * PearAI 채팅 패널 열기.
 * "Toggle PearAI Side Bar (⌘;)" 버튼으로 열기.
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
            if (label.includes('toggle pearai') || label.includes('toggle secondary') ||
                label.includes('toggle auxiliary')) {
                if (btn.offsetWidth > 0 || btn.offsetHeight > 0) {
                    btn.click();
                    return 'opened (toggle)';
                }
            }
        }

        // 3. Cmd+; 단축키 폴백 (PearAI 기본 단축키)
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: ';', code: 'Semicolon', keyCode: 186,
            metaKey: true, ctrlKey: false,
            bubbles: true, cancelable: true,
        }));
        document.dispatchEvent(new KeyboardEvent('keyup', {
            key: ';', code: 'Semicolon', keyCode: 186,
            metaKey: true, ctrlKey: false,
            bubbles: true, cancelable: true,
        }));

        return 'opened (⌘;)';
    } catch (e) {
        return 'error: ' + e.message;
    }
})()
