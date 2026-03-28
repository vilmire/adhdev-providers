/**
 * Trae — read_chat
 *
 * Trae from main DOM chat content accessible.
 * chat is .chat-turn element .
 * : .user-chat-bubble-request__content-wrapper
 * : .assistant-chat-turn-content .chat-markdown
 *
 * Return: ReadChatResult { id, status, messages, title?, inputContent?, activeModal? }
 */
(() => {
    try {
        const auxbar = document.getElementById('workbench.parts.auxiliarybar');
        if (!auxbar || auxbar.offsetWidth === 0) {
            return JSON.stringify({ id: '', status: 'idle', messages: [] });
        }

        // ─── 1. Collect messages ───
        const messages = [];
        const turns = auxbar.querySelectorAll('.chat-turn');

        turns.forEach((turn, idx) => {
            // User message
            const userBubble = turn.querySelector('.user-chat-bubble-request__content-wrapper');
            if (userBubble) {
                messages.push({
                    role: 'user',
                    content: userBubble.textContent.trim(),
                    index: idx,
                });
            }

            // Assistant message
            const assistantEl = turn.querySelector('.assistant-chat-turn-content');
            if (assistantEl) {
                const mdBlocks = assistantEl.querySelectorAll('.chat-markdown-p, .chat-markdown pre');
                let content = '';
                if (mdBlocks.length > 0) {
                    content = Array.from(mdBlocks).map(b => b.textContent.trim()).join('\n');
                } else {
                    content = assistantEl.textContent.trim();
                }
                if (content) {
                    messages.push({
                        role: 'assistant',
                        content: content,
                        index: idx,
                    });
                }
            }
        });

        // ─── 2. status detection ───
        let status = 'idle';

        // Stop button exists → generating
        const stopBtn = auxbar.querySelector('button[class*="stop"], [aria-label*="stop" i], [aria-label*="Stop"]');
        if (stopBtn && stopBtn.offsetWidth > 0) {
            status = 'generating';
        }

 // progress bar → generating
        const progress = auxbar.querySelector('.monaco-progress-container:not(.done)');
        if (progress && progress.offsetWidth > 0) {
            status = 'generating';
        }

 // latest-assistant-bar most accurate (final determination)
        const latestBar = auxbar.querySelector('.latest-assistant-bar');
        if (latestBar) {
            const barText = latestBar.textContent.toLowerCase();
            if (barText.includes('completed') || barText.includes('done')) {
                status = 'idle';
            } else if (barText.includes('thinking') || barText.includes('generating') || barText.includes('running') || barText.includes('searching')) {
                status = 'generating';
            }
        }

        // ─── 3. approval wait modal ───
        let activeModal = null;
        const dialogs = auxbar.querySelectorAll('[role="dialog"], .monaco-dialog-box, [class*="approval"], [class*="confirm"]');
        if (dialogs.length > 0) {
            const dialog = dialogs[0];
            const buttons = Array.from(dialog.querySelectorAll('button')).map(b => b.textContent.trim()).filter(Boolean);
            if (buttons.length > 0) {
                activeModal = {
                    message: dialog.textContent.trim().substring(0, 200),
                    buttons: buttons,
                };
                status = 'waiting_approval';
            }
        }

        // ─── 4. Input field content ───
        const input = auxbar.querySelector('.chat-input-v2-input-box-editable, [contenteditable="true"]');
        const inputContent = input ? input.textContent.trim() : '';

        // ─── 5. Session ID / Title ───
        const sessionTab = auxbar.querySelector('[class*="session-tab"], [class*="chat-title"]');
        const title = sessionTab ? sessionTab.textContent.trim() : '';

        return JSON.stringify({
            id: title || 'trae-default',
            status: status,
            messages: messages,
            title: title || undefined,
            inputContent: inputContent || undefined,
            activeModal: activeModal,
        });
    } catch (e) {
        return JSON.stringify({ id: '', status: 'error', messages: [], error: e.message });
    }
})()
