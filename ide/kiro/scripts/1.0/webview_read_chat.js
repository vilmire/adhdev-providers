/**
 * Kiro — webview_read_chat (webview iframe runs inside)
 *
 * Kiro chat UI webview iframe located at,
 * evaluateInWebviewFrame execute.
 *
 * DOM structure:
 *   .kiro-chat-timeline
 *     .kiro-chat-message (user/assistant messages)
 *       .kiro-chat-message-meta → .kiro-chat-message-role (sender)
 *       .kiro-chat-message-body → .kiro-chat-message-markdown (content)
 *
 * Return: ReadChatResult { id, status, messages, inputContent? }
 */
(() => {
    try {
        const messages = [];
        const msgElements = document.querySelectorAll('.kiro-chat-message');

        msgElements.forEach((msg, idx) => {
            const roleMeta = msg.querySelector('.kiro-chat-message-role');
            const roleText = (roleMeta?.textContent || '').trim();
            const isKiro = roleText.toLowerCase().includes('kiro');
            const role = isKiro ? 'assistant' : 'user';

            let parts = [];

            // A helper to traverse and build rough markdown
            const parseNode = (node) => {
                if (node.nodeType === Node.TEXT_NODE) {
                    return node.nodeValue;
                }
                const tag = node.tagName?.toLowerCase();
                if (!tag) return '';

                // Kiro Thought / Tool executions
                if (tag === 'div' && node.className.includes('kiro-thought')) {
                    const toggle = node.querySelector('.summary')?.textContent || 'thought';
                    const content = Array.from(node.querySelectorAll('.details')).map(n => n.textContent).join('\n');
                    parts.push({ kind: 'thought', content });
                    return `\n<details><summary>${toggle}</summary>\n${content}\n</details>\n`;
                }

                // Kiro Agent Outcomes (Terminal / Command)
                if (tag === 'div' && node.className.includes('agent-outcome')) {
                    const label = (node.querySelector('.agent-outcome-label')?.textContent || '').toLowerCase();
                    const pre = node.querySelector('.agent-outcome-details pre, .agent-outcome-details code');
                    const codeContent = (pre?.textContent || '').trim();
                    if (codeContent) {
                        const kind = label.includes('command') || label.includes('terminal') ? 'terminal' : 'tool';
                        // Add directly to parts since this is a structured execution
                        parts.push({ kind, content: codeContent });
                        return `\n> [${kind}] ${codeContent}\n`;
                    }
                }

                if (tag === 'pre') {
                    const code = node.querySelector('code');
                    const lang = code?.className?.replace('language-', '') || '';
                    return `\n\`\`\`${lang}\n${node.textContent}\n\`\`\`\n`;
                }
                if (tag === 'code') {
                    return `\`${node.textContent}\``;
                }
                if (tag === 'table') {
                    let str = '\n';
                    const rows = Array.from(node.querySelectorAll('tr'));
                    rows.forEach((row, i) => {
                        const cells = Array.from(row.querySelectorAll('td, th')).map(c => c.textContent.trim());
                        str += '| ' + cells.join(' | ') + ' |\n';
                        if (i === 0 && row.querySelector('th')) {
                            str += '|' + cells.map(() => '---').join('|') + '|\n';
                        }
                    });
                    return str + '\n';
                }
                if (tag === 'p') {
                    const text = Array.from(node.childNodes).map(parseNode).join('');
                    return text + '\n\n';
                }
                
                // Recursively parse children for span, div, etc
                return Array.from(node.childNodes).map(parseNode).join('');
            };

            const body = msg.querySelector('.kiro-chat-message-body');
            let content = '';
            if (body) {
                // Parse the ENTIRE body recursively so we don't skip elements!
                content = parseNode(body).trim();
            }

            // Fallback content parsing if recursive failed
            if (!content) {
                content = body?.textContent?.trim() || '';
            }

            if (content) {
                parts.push({ kind: 'text', content });
            }

            if (parts.length > 0) {
                messages.push({ role, content: parts.map(p => p.content).join('\n'), parts });
            }
        });

 // status detection activeModal extract
        let status = 'idle';
        let activeModal = undefined;

        // "Working" / "Cancel" button → generating
        const snackbar = document.querySelector('.kiro-snackbar');
        if (snackbar && snackbar.offsetWidth > 0) {
            const barText = (snackbar.textContent || '').toLowerCase();
            if (barText.includes('working') || barText.includes('cancel')) {
                status = 'generating';
            } else if (barText.includes('waiting') || barText.includes('input')) {
                // Waiting for approval (waiting on your input)
                const titleEl = snackbar.querySelector('.kiro-snackbar-title, .thinking-text');
                const actionsEl = snackbar.querySelectorAll('.kiro-snackbar-actions button');
                const buttons = Array.from(actionsEl).map(b => (b.textContent || '').trim());
                
                if (buttons.length > 0) {
                    activeModal = {
                        title: (titleEl?.textContent || '').trim(),
                        buttons,
                        type: 'approval'
                    };
                    status = 'waiting_approval';
                }
            }
        }
        
        // If snackbar didn't catch it, fallback to Stop button checking
        if (status === 'idle') {
            const hasStopBtn = document.querySelector('.codicon-debug-stop, [aria-label*="stop" i], [title*="stop" i], [title*="cancel generation" i], .kiro-button[data-loading="true"]');
            if (hasStopBtn) {
                status = 'generating';
            }
        }

        // Input field content
        const input = document.querySelector('.tiptap.ProseMirror, [contenteditable="true"]');
        const inputContent = input ? input.textContent?.trim() : '';

 // session 
        const tab = document.querySelector('.kiro-tabs-item.active, .kiro-tabs-item[aria-selected="true"]');
        const title = tab?.textContent?.trim() || '';

        return JSON.stringify({
            id: title || 'kiro-default',
            status,
            messages,
            title: title || '',
            inputContent: inputContent || '',
            ...(activeModal ? { activeModal } : {})
        });
    } catch (e) {
        return JSON.stringify({ id: '', status: 'error', messages: [], error: e.message });
    }
})()
