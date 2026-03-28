/**
 * PearAI — webview_read_chat
 */
(() => {
    try {
        const normalize = (value) => String(value || '').replace(/\r/g, '').replace(/\u00a0/g, ' ');
        const collapse = (value) => normalize(value).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        const fence = '```';

        const markdownFromNode = (node, depth = 0) => {
            if (!node || depth > 20) return '';
            if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
            if (node.nodeType !== Node.ELEMENT_NODE) return '';

            const tag = node.tagName.toLowerCase();
            const children = () => Array.from(node.childNodes).map((child) => markdownFromNode(child, depth + 1)).join('');

            if (tag === 'br') return '\n';
            if (tag === 'hr') return '\n---\n\n';
            if (tag === 'strong' || tag === 'b') return `**${children().trim()}**`;
            if (tag === 'em' || tag === 'i') return `*${children().trim()}*`;
            if (tag === 'code' && node.parentElement?.tagName?.toLowerCase() !== 'pre') return `\`${node.textContent || ''}\``;
            if (tag === 'pre') {
                const code = normalize(node.textContent || '').replace(/^\n+|\n+$/g, '');
                const lang = Array.from(node.querySelectorAll('code')).map((codeNode) => {
                    const match = String(codeNode.className || '').match(/language-([\w-]+)/);
                    return match ? match[1] : '';
                }).find(Boolean) || '';
                return `\n\n${fence}${lang}\n${code}\n${fence}\n\n`;
            }
            if (tag === 'a') {
                const text = collapse(children()) || collapse(node.textContent || '');
                const href = node.getAttribute('href') || '';
                return href ? `[${text}](${href})` : text;
            }
            if (tag === 'li') return `- ${collapse(children())}\n`;
            if (tag === 'ul' || tag === 'ol') return `\n${Array.from(node.children).map((child) => markdownFromNode(child, depth + 1)).join('')}\n`;
            if (tag === 'p') return `${children().trim()}\n\n`;
            if (tag === 'table') {
                const rows = Array.from(node.querySelectorAll('tr')).map((row) => Array.from(row.children).map((cell) => collapse(markdownFromNode(cell, depth + 1)) || collapse(cell.textContent || '')));
                if (!rows.length) return '';
                const header = rows[0];
                const divider = header.map(() => '---');
                const body = rows.slice(1);
                return `\n| ${header.join(' | ')} |\n| ${divider.join(' | ')} |\n${body.map((row) => `| ${row.join(' | ')} |`).join('\n')}\n\n`;
            }
            if (tag === 'button') return '';
            return children();
        };

        const title = collapse(
            document.querySelector('.font-bold + .ml-1')?.textContent
            || document.querySelector('.font-bold')?.nextElementSibling?.textContent
            || ''
        ).replace(/^Task:\s*/i, '');
        const input = document.querySelector('textarea[placeholder*="Type your task" i]') || document.querySelector('textarea');
        const inputContent = input ? input.value || '' : '';

        const rawItems = Array.from(document.querySelectorAll('[data-item-index]')).map((element) => ({
            element,
            text: collapse(element.innerText || element.textContent || ''),
        })).filter((item) => item.text);

        const messages = [];
        let activeModal = null;

        if (title) {
            messages.push({ role: 'user', content: title, index: messages.length });
        }

        const significant = rawItems.filter((item) => !/^API Request(?:\n|$)/i.test(item.text) && !/^Initial Checkpoint(?:\n|$)/i.test(item.text));

        for (let itemIndex = 0; itemIndex < significant.length; itemIndex += 1) {
            const item = significant[itemIndex];
            const { element, text } = item;

            if (/^Thinking$/i.test(text)) continue;
            if (element.querySelector('.codicon-trash')) {
                messages.push({ role: 'user', content: text, index: messages.length });
                continue;
            }

            if (element.querySelector('.codicon-terminal') || /^Run Command:/i.test(text)) {
                const command = collapse(element.querySelector('.font-mono')?.textContent || text.replace(/^Run Command:\s*/i, ''));
                messages.push({
                    role: 'assistant',
                    content: command ? `${fence}sh\n${command}\n${fence}` : 'Run Command',
                    kind: 'terminal',
                    meta: { label: 'Run Command' },
                    index: messages.length,
                });
                continue;
            }

            if (element.querySelector('.text-muted-foreground') && text.startsWith('...')) {
                messages.push({
                    role: 'assistant',
                    content: text.replace(/^\.\.\.\s*/, ''),
                    kind: 'thought',
                    meta: { label: 'Thinking' },
                    index: messages.length,
                });
                continue;
            }

            if (element.querySelector('.codicon-question') || /^Agent has a question:/i.test(text)) {
                const contentNode = element.querySelector('.sc-fkSzgi') || element;
                let content = collapse(markdownFromNode(contentNode));
                const actions = Array.from(element.querySelectorAll('button[aria-label]')).map((button) => collapse(button.getAttribute('aria-label') || button.textContent || '')).filter(Boolean);
                if (actions.length) {
                    content = `${content}\n\n${actions.map((action) => `- ${action}`).join('\n')}`.trim();
                    if (itemIndex === significant.length - 1) {
                        activeModal = { title: 'Agent has a question', actions };
                    }
                }
                messages.push({ role: 'assistant', content, index: messages.length });
                continue;
            }

            if (element.querySelector('.codicon-check') && /^Task Completed/i.test(text)) {
                const contentNode = element.querySelector('.sc-fkSzgi') || element;
                const content = collapse(markdownFromNode(contentNode).replace(/^Task Completed\s*/i, ''));
                messages.push({ role: 'assistant', content, index: messages.length });
                continue;
            }

            const markdownNode = element.querySelector('.sc-fkSzgi') || element;
            const content = collapse(markdownFromNode(markdownNode));
            if (content) {
                messages.push({ role: 'assistant', content, index: messages.length });
            }
        }

        let status = 'idle';
        const visibleButtons = Array.from(document.querySelectorAll('button')).filter((button) => {
            const rect = button.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        });

        const actionButtons = visibleButtons
            .map((button) => collapse(button.textContent || button.getAttribute('aria-label') || ''))
            .filter((text) => /approve|accept|allow|run|save|reject|deny|abort/i.test(text));
        if (!activeModal && actionButtons.length >= 2) {
            activeModal = { title: 'Action Required', actions: actionButtons };
        }
        if (activeModal?.actions?.length) {
            status = 'waiting_approval';
        }

        const generatingIndicators = [
            ...visibleButtons.map((button) => collapse(button.textContent || button.getAttribute('aria-label') || '')),
            collapse(document.body.innerText || ''),
        ].join('\n');
        if (/cancel|stop generating|streaming|responding/i.test(generatingIndicators)) {
            status = activeModal?.actions?.length ? 'waiting_approval' : 'generating';
        }

        return JSON.stringify({
            id: 'pearai-agent',
            title: title || undefined,
            status,
            messages,
            inputContent: inputContent || undefined,
            activeModal: activeModal || undefined,
        });
    } catch (error) {
        return JSON.stringify({ id: 'pearai-agent', status: 'error', messages: [], error: String(error && error.message || error) });
    }
})()
