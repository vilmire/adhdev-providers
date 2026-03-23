/**
 * PearAI — webview_new_session (webview iframe 내부에서 실행)
 *
 * Roo Code/Cline 기반 PearAI에서 새 세션(태스크)을 시작합니다.
 * 1) "New Task" 텍스트를 가진 버튼 클릭 시도
 * 2) 실패 시, vscode postMessage API로 newTask 명령 전송 시도
 * 3) 실패 시, chat-text-area를 초기화하여 새 세션 상태로 진입
 */
(() => {
    try {
        // Strategy 1: Find "New Task" button text
        const buttons = document.querySelectorAll('button, [role="button"]');
        for (const btn of buttons) {
            const text = (btn.textContent || '').trim();
            if (text.includes('Start New Task') || text.includes('New Task') || text.includes('New Chat')) {
                btn.click();
                return JSON.stringify({ created: true, method: 'button', text });
            }
        }

        // Strategy 2: Look for a "+" (plus/add) button that might create new tasks
        for (const btn of buttons) {
            const title = btn.getAttribute('title') || '';
            const ariaLabel = btn.getAttribute('aria-label') || '';
            if (title.includes('New') || ariaLabel.includes('New') || 
                title.includes('new') || ariaLabel.includes('new')) {
                btn.click();
                return JSON.stringify({ created: true, method: 'title', title: title || ariaLabel });
            }
        }

        // Strategy 3: Use vscode API to post message for new task
        if (typeof acquireVsCodeApi !== 'undefined') {
            const vscode = acquireVsCodeApi();
            vscode.postMessage({ type: 'newTask' });
            return JSON.stringify({ created: true, method: 'vscodeApi' });
        }

        // Strategy 4: If already in empty state (no messages), report as already new
        const messages = document.querySelectorAll('[class*="message"], [class*="chat-row"]');
        if (messages.length === 0) {
            return JSON.stringify({ created: true, method: 'alreadyNew', note: 'No messages - already in new session state' });
        }

        return JSON.stringify({ created: false, error: 'New Task button not found' });
    } catch (e) {
        return JSON.stringify({ created: false, error: e.message });
    }
})()
