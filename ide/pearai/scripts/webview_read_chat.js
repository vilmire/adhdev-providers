/**
 * PearAI — webview_read_chat (webview iframe 내부에서 실행)
 *
 * PearAI는 Roo Code / Cline 기반의 Agent 패널을 사용.
 * React로 렌더링된 DOM에서 메시지를 파싱.
 *
 * DOM 단서:
 *   - textarea.chat-text-area: 입력 필드
 *   - Task: ... : 유저 메시지
 *   - API Request 등: 시스템 메시지
 *
 * 반환: ReadChatResult { id, status, messages, inputContent? }
 */
(() => {
    try {
        const messages = [];

        // 메시지 블록 찾기 — 다양한 셀렉터 시도
        // Cline/Roo Code 기반이므로 유사한 구조
        const allText = document.body?.textContent || '';

        // Task 헤더에서 유저 메시지
        const taskEl = document.querySelector('[class*="task-header"], [class*="TaskHeader"]');
        if (taskEl) {
            const taskText = taskEl.textContent?.trim() || '';
            if (taskText) {
                messages.push({ role: 'user', content: taskText.replace(/^Task:\s*/i, ''), index: 0 });
            }
        }

        // 채팅 메시지 영역 파싱 — 공통 클래스
        const chatMessages = document.querySelectorAll('[class*="chat-row"], [class*="ChatRow"], [class*="message-row"], [class*="MessageRow"]');
        chatMessages.forEach((msg, idx) => {
            const text = msg.textContent?.trim() || '';
            if (!text) return;

            // role 판정 — 클래스명이나 아이콘으로
            const isUser = msg.querySelector('[class*="user"]') != null || msg.classList.toString().includes('user');
            messages.push({
                role: isUser ? 'user' : 'assistant',
                content: text.substring(0, 2000),
                index: idx,
            });
        });

        // 메시지가 없으면 전체 텍스트에서 추출
        if (messages.length === 0 && allText.length > 50) {
            // Task: 패턴 찾기
            const taskMatch = allText.match(/Task:\s*(.+?)(?:\d+[\d.,]*k|\d+\s*$)/s);
            if (taskMatch) {
                messages.push({ role: 'user', content: taskMatch[1].trim().substring(0, 500), index: 0 });
            }
            // AI 응답 찾기 (간략화)
            const bodyContent = allText.substring(0, 2000);
            if (bodyContent.includes('API Request') || bodyContent.includes('Initial Checkpoint')) {
                // 응답이 있음을 표시
                messages.push({ role: 'assistant', content: '(response in progress or completed)', index: 1 });
            }
        }

        // 상태 감지
        let status = 'idle';
        const cancelBtn = document.querySelector('button[class*="cancel"], [aria-label*="cancel" i]');
        if (cancelBtn && cancelBtn.offsetWidth > 0 && cancelBtn.textContent?.toLowerCase().includes('cancel')) {
            status = 'generating';
        }

        // API Request... (로딩) → generating
        const loadingEl = document.querySelector('[class*="loading"], [class*="spinner"]');
        if (loadingEl && loadingEl.offsetWidth > 0) {
            status = 'generating';
        }

        // "Retrying" → error/generating
        if (allText.includes('Retrying in') || allText.includes('Retry attempt')) {
            status = 'generating';
        }

        // 입력 필드
        const textarea = document.querySelector('textarea[placeholder*="Type"], textarea.chat-text-area, textarea');
        const inputContent = textarea ? textarea.value || textarea.textContent?.trim() : '';

        return JSON.stringify({
            id: 'pearai-agent',
            status,
            messages,
            inputContent: inputContent || undefined,
        });
    } catch (e) {
        return JSON.stringify({ id: '', status: 'error', messages: [], error: e.message });
    }
})()
