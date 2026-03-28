/**
 * PearAI — webview_list_sessions (webview iframe 내부에서 실행)
 *
 * PearAI(Roo Code/Cline 기반) 세션 목록을 추출.
 * 히스토리 뷰의 task-item 과 홈 화면의 최근 작업 카드 둘 다 지원.
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

        // ─── 히스토리 항목: data-testid="task-item-*" ───
        const taskItems = document.querySelectorAll('[data-testid^="task-item-"]');

        if (taskItems.length > 0) {
            for (let i = 0; i < taskItems.length; i++) {
                const item = taskItems[i];
                if (!item) continue;

                const testId = item.getAttribute('data-testid') || '';
                const taskId = testId.replace('task-item-', '');

                // 전체 텍스트에서 제목 추출
                const fullText = (item.textContent || '').trim();

                // 구조: "MARCH 16, 1:31 AM 173 B test123 Tokens:10.4k 229"
                // 전략: Tokens: 앞의 마지막 의미있는 텍스트를 제목으로 사용
                let title = '';

                // 날짜 추출
                // 제목 추출: 날짜와 크기(B/kB) 뒤, Tokens: 앞
                const titleMatch = fullText.match(/[AP]M[\d.\s]*[kMG]?B\s*(.*?)(?:Tokens:|$)/s);
                if (titleMatch && titleMatch[1]) {
                    title = titleMatch[1].trim();
                }

                // fallback: 첫 80자
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

        // ─── 홈 화면 최근 작업 카드 ───
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
