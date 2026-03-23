/**
 * PearAI — webview_list_sessions (webview iframe 내부에서 실행)
 *
 * PearAI(Roo Code/Cline 기반) 히스토리 뷰에서 세션 목록을 추출.
 * 각 항목은 data-testid="task-item-{UUID}" 로 식별됨.
 */
(() => {
    try {
        // ─── 히스토리 항목: data-testid="task-item-*" ───
        const taskItems = document.querySelectorAll('[data-testid^="task-item-"]');
        
        if (taskItems.length > 0) {
            const sessions = [];
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
                let date = '';
                
                // 날짜 추출
                const dateMatch = fullText.match(/^([A-Z]+\s+\d+,\s*\d+:\d+\s*[AP]M)/);
                if (dateMatch) date = dateMatch[1];
                
                // 제목 추출: 날짜와 크기(B/kB) 뒤, Tokens: 앞
                const titleMatch = fullText.match(/[AP]M[\d.\s]*[kMG]?B\s*(.*?)(?:Tokens:|$)/s);
                if (titleMatch && titleMatch[1]) {
                    title = titleMatch[1].trim();
                }
                
                // fallback: 첫 80자
                if (!title) {
                    title = fullText.substring(0, 80);
                }
                
                sessions.push({
                    id: taskId,
                    title: title.substring(0, 100),
                    date: date,
                    active: false
                });
            }
            return JSON.stringify({ sessions: sessions });
        }

        // ─── 히스토리 뷰가 열려 있지 않음 ───
        return JSON.stringify({ 
            sessions: [], 
            note: 'History view not open. Toggle history first.' 
        });
    } catch (e) {
        return JSON.stringify({ sessions: [], error: String(e.message || e) });
    }
})()
