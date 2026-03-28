/**
 * PearAI — webview_switch_session
 * ${ INDEX }
 * ${ TITLE }
 */
(() => {
    try {
        const targetIndex = Number(${ INDEX });
        const targetTitle = String(${ TITLE }).trim().toLowerCase();

        const clickElement = (element) => {
            if (!element) return false;
            const rect = element.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            element.scrollIntoView({ block: 'center' });
            element.focus?.();
            element.click?.();
            for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
                element.dispatchEvent(new PointerEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    clientX: x,
                    clientY: y,
                    pointerId: 1,
                    pointerType: 'mouse',
                }));
            }
            return true;
        };

        const taskItems = Array.from(document.querySelectorAll('[data-testid^="task-item-"]'));
        if (taskItems.length) {
            let match = null;
            if (targetTitle) {
                match = taskItems.find((item) => (item.textContent || '').trim().toLowerCase().includes(targetTitle));
            }
            if (!match && Number.isInteger(targetIndex) && targetIndex >= 0 && targetIndex < taskItems.length) {
                match = taskItems[targetIndex];
            }
            if (match && clickElement(match)) {
                return JSON.stringify({ switched: true, title: (match.textContent || '').trim().slice(0, 120) });
            }
        }

        const cards = Array.from(document.querySelectorAll('div')).filter((card) => {
            const className = String(card.className || '');
            const text = (card.textContent || '').trim();
            return className.includes('bg-vscode-editor-background')
                && className.includes('cursor-pointer')
                && className.includes('overflow-hidden')
                && !!card.querySelector('[data-testid="copy-prompt-button"]')
                && /↑\s*\d|↓\s*\d/i.test(text)
                && /MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JANUARY|FEBRUARY/i.test(text);
        });

        let match = null;
        if (targetTitle) {
            match = cards.find((card) => {
                const promptText = (card.querySelector('.text-vscode-foreground')?.textContent || '').trim().toLowerCase();
                return promptText.includes(targetTitle);
            });
        }
        if (!match && Number.isInteger(targetIndex) && targetIndex >= 0 && targetIndex < cards.length) {
            match = cards[targetIndex];
        }
        if (!match && cards.length === 1) {
            match = cards[0];
        }

        const clickTarget = match ? (match.querySelector('.text-vscode-foreground') || match) : null;
        if (clickTarget && clickElement(clickTarget)) {
            return JSON.stringify({ switched: true, title: (match.textContent || '').trim().slice(0, 120) });
        }

        return JSON.stringify({ switched: false, error: 'session not found' });
    } catch (error) {
        return JSON.stringify({ switched: false, error: String(error && error.message || error) });
    }
})()
