/**
 * PearAI — webview_list_sessions (webview iframe runs inside)
 *
 * PearAI(Roo Code/Cline based) Session list extract.
 * history task-item Tasks .
 */
(() => {
    try {
        const sessions = [];
        const seen = new Set();

        const pushSession = (session) => {
            if (!session || !session.id || seen.has(session.id)) return;
            seen.add(session.id);
            sessions.push({
                id: session.id,
                title: (session.title || '').trim().slice(0, 120),
                active: Boolean(session.active),
                index: typeof session.index === 'number' ? session.index : sessions.length,
            });
        };

        // ─── History items: data-testid="task-item-*" ───
        const taskItems = document.querySelectorAll('[data-testid^="task-item-"]');

        if (taskItems.length > 0) {
            for (let i = 0; i < taskItems.length; i++) {
                const item = taskItems[i];
                if (!item) continue;

                const testId = item.getAttribute('data-testid') || '';
                const taskId = testId.replace('task-item-', '');

                // Extract title from full text
                const fullText = (item.textContent || '').trim();

                // structure: "MARCH 16, 1:31 AM 173 B test123 Tokens:10.4k 229"
 // strategy: Tokens: before last with text title use
                let title = '';

                // Extract date
 // title extract: (B/kB) , Tokens: before
                const titleMatch = fullText.match(/[AP]M[\d.\s]*[kMG]?B\s*(.*?)(?:Tokens:|$)/s);
                if (titleMatch && titleMatch[1]) {
                    title = titleMatch[1].trim();
                }

                // fallback: first 80 chars
                if (!title) {
                    title = fullText.substring(0, 80);
                }

                pushSession({
                    id: taskId || `task-${i}`,
                    title,
                    active: item.getAttribute('aria-selected') === 'true' || item.classList.contains('active'),
                    index: i,
                });
            }
        }

 // ─── Tasks ───
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

        cards.forEach((card, index) => {
            const text = (card.textContent || '').trim();
            const prompt = card.querySelector('.text-vscode-foreground');
            const title = (prompt?.textContent || text)
                .replace(/\s*↑\s*\d[\d.,kKmM]*\s*↓\s*\d[\d.,kKmM]*/g, '')
                .trim();

            pushSession({
                id: card.getAttribute('data-testid') || `card-${index}`,
                title,
                active: false,
                index,
            });
        });

        return JSON.stringify({ sessions, note: sessions.length ? undefined : 'No sessions found' });
    } catch (e) {
        return JSON.stringify({ sessions: [], error: String(e.message || e) });
    }
})()
