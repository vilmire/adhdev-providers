/**
 * PearAI — webview_new_session
 */
(() => {
    try {
        const click = (element) => {
            if (!element) return false;
            element.scrollIntoView({ block: 'center' });
            element.focus?.();
            element.click?.();
            return true;
        };

        const closeTask = Array.from(document.querySelectorAll('button[title], button[aria-label]')).find((button) =>
            /close task and start a new one/i.test(button.getAttribute('title') || '')
            || /close task and start a new one/i.test(button.getAttribute('aria-label') || '')
        );
        if (click(closeTask)) {
            return JSON.stringify({ created: true, method: 'close-task' });
        }

        const startNewTask = Array.from(document.querySelectorAll('button, [role="button"], div.cursor-pointer')).find((element) =>
            /start new task|new task|new chat/i.test((element.textContent || '').trim())
        );
        if (click(startNewTask)) {
            return JSON.stringify({ created: true, method: 'start-new-task' });
        }

        const cards = document.querySelectorAll('[data-testid="copy-prompt-button"]');
        if (cards.length > 0) {
            return JSON.stringify({ created: true, method: 'already-home' });
        }

        return JSON.stringify({ created: false, error: 'new session control not found' });
    } catch (error) {
        return JSON.stringify({ created: false, error: String(error && error.message || error) });
    }
})()
