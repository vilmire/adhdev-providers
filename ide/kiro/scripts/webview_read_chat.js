/**
 * Kiro — webview_read_chat (webview iframe 내부에서 실행)
 *
 * Kiro의 채팅 UI는 webview iframe 안에 위치하며,
 * 데몬의 evaluateInWebviewFrame을 통해 실행됨.
 *
 * DOM 구조:
 *   .kiro-chat-timeline
 *     .kiro-chat-message (유저/어시스턴트 메시지)
 *       .kiro-chat-message-meta → .kiro-chat-message-role (발신자)
 *       .kiro-chat-message-body → .kiro-chat-message-markdown (내용)
 *
 * 반환: ReadChatResult { id, status, messages, inputContent? }
 */
(() => {
    try {
        const messages = [];
        const msgElements = document.querySelectorAll('.kiro-chat-message');

        msgElements.forEach((msg, idx) => {
            const roleMeta = msg.querySelector('.kiro-chat-message-role');
            const roleText = (roleMeta?.textContent || '').trim();
            const isKiro = roleText.toLowerCase() === 'kiro';
            const role = isKiro ? 'assistant' : 'user';

            const body = msg.querySelector('.kiro-chat-message-body');
            let content = '';
            if (body) {
                const markdown = body.querySelector('.kiro-chat-message-markdown');
                content = (markdown || body).textContent?.trim() || '';
            }

            if (content) {
                messages.push({ role, content, index: idx });
            }
        });

        // 상태 감지
        let status = 'idle';

        // "Working" / "Cancel" 버튼 → generating
        const workingBar = document.querySelector('.kiro-snackbar');
        if (workingBar && workingBar.offsetWidth > 0) {
            const barText = (workingBar.textContent || '').toLowerCase();
            if (barText.includes('working') || barText.includes('cancel')) {
                status = 'generating';
            }
        }

        // 입력 필드 내용
        const input = document.querySelector('.tiptap.ProseMirror, [contenteditable="true"]');
        const inputContent = input ? input.textContent?.trim() : '';

        // 세션 탭
        const tab = document.querySelector('.kiro-tabs-item.active, .kiro-tabs-item[aria-selected="true"]');
        const title = tab?.textContent?.trim() || '';

        return JSON.stringify({
            id: title || 'kiro-default',
            status,
            messages,
            title: title || undefined,
            inputContent: inputContent || undefined,
        });
    } catch (e) {
        return JSON.stringify({ id: '', status: 'error', messages: [], error: e.message });
    }
})()
