/**
 * PearAI — new_session (IDE 메인 프레임에서 실행)
 * 
 * Panel title bar의 "+" 버튼(New Task)을 찾아 클릭합니다.
 * PearAI(Roo Code 기반)에서 새 태스크 버튼은 webview 바깥의 VS Code panel 헤더에 위치합니다.
 */
(() => {
    try {
        // Strategy 1: Find the codicon-add / plus button in panel title actions
        const actionBtns = document.querySelectorAll('.panel .title .actions-container .action-item a, .pane-header .actions-container .action-item a, .title-actions .action-item a');
        for (const btn of actionBtns) {
            const title = btn.getAttribute('title') || '';
            const ariaLabel = btn.getAttribute('aria-label') || '';
            const cls = btn.className || '';
            
            if (title.toLowerCase().includes('new task') || 
                title.toLowerCase().includes('new chat') ||
                ariaLabel.toLowerCase().includes('new task') ||
                ariaLabel.toLowerCase().includes('new chat') ||
                cls.includes('codicon-add') ||
                cls.includes('codicon-plus')) {
                btn.click();
                return JSON.stringify({ created: true, method: 'panelAction', title: title || ariaLabel });
            }
        }

        // Strategy 2: Broader search for action items with "+" or "new" 
        const allActions = document.querySelectorAll('.action-item a.action-label');
        for (const a of allActions) {
            const title = (a.getAttribute('title') || '').toLowerCase();
            const cls = a.className || '';
            if ((title.includes('new') && title.includes('task')) ||
                (title.includes('plus') || cls.includes('codicon-add'))) {
                a.click();
                return JSON.stringify({ created: true, method: 'actionLabel', title: a.getAttribute('title') });
            }
        }

        // Strategy 3: Use keybinding (Cmd+Shift+P -> "new task")
        // Simulate keyboard shortcut for Roo Code: typically there's a command 
        // registered as roo-cline.plusButtonClicked or similar
        const allBtns = document.querySelectorAll('a[title], button[title]');
        const matches = [];
        for (const btn of allBtns) {
            const t = btn.getAttribute('title') || '';
            if (t.toLowerCase().includes('new') || t.toLowerCase().includes('plus') || t === '+') {
                matches.push({ tag: btn.tagName, title: t, cls: (btn.className || '').substring(0, 60) });
            }
        }

        return JSON.stringify({ created: false, error: 'New Task button not found in panel', candidates: matches.slice(0, 5) });
    } catch (e) {
        return JSON.stringify({ created: false, error: e.message });
    }
})()
