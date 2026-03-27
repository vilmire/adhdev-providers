/**
 * Windsurf v1 — read_chat
 */
(() => {
    try {
        const cascade = document.querySelector('#windsurf\\.cascadePanel') || document.querySelector('.chat-client-root');
        const normalize = (text) => (text || '').replace(/[\u200b\u00a0]+/g, ' ').replace(/\s+/g, ' ').trim();
        const cleanText = (text) => normalize((text || '').replace(/Run⌥⏎/g, 'Run').replace(/\b(Skip|Accept|Reject|Approve|Allow|Deny)\b/g, ' $1 ').replace(/\s+/g, ' '));
        const isVisible = (el) => !!(el && el.offsetWidth > 0 && el.offsetHeight > 0);

        if (!cascade) {
            return JSON.stringify({ id: 'no_cascade', status: 'idle', title: 'Cascade', messages: [], inputContent: '', activeModal: null });
        }

        const title = normalize(
            document.querySelector('[id^="cascade-tab-"] .truncate, [id^="cascade-tab-"] span')?.textContent
            || document.title.split(' — ').pop()
            || 'Cascade'
        );

        const activeTab = Array.from(document.querySelectorAll('[id^="cascade-tab-"]')).find(isVisible);
        let cascadeId = activeTab?.id?.replace(/^cascade-tab-/, '') || 'active';
        let fiberRunning = false;
        let fiberPendingCommand = false;

        const readFiberValue = (node) => {
            if (!node || typeof node !== 'object') return;
            const key = Object.keys(node).find(name => name.startsWith('__reactFiber'));
            if (!key) return;
            let fiber = node[key];
            for (let depth = 0; fiber && depth < 40; depth += 1, fiber = fiber.return) {
                const props = fiber.memoizedProps || fiber.pendingProps || {};
                if (!cascadeId && typeof props.cascadeId === 'string') cascadeId = props.cascadeId;
                if (props.cascadeId && typeof props.cascadeId === 'string') cascadeId = props.cascadeId;
                if (props.isRunning === true) fiberRunning = true;
                if (props.hasPendingTerminalCommand === true) fiberPendingCommand = true;
            }
        };

        readFiberValue(cascade);

        const BLOCK_TAGS = new Set(['DIV', 'P', 'BR', 'LI', 'TR', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER']);
        const extractCodeText = (node) => {
            if (!node) return '';
            if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
            if (node.nodeType !== Node.ELEMENT_NODE) return '';
            if (node.tagName === 'BR') return '\n';
            const parts = [];
            for (const child of node.childNodes) {
                const block = child.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(child.tagName);
                const text = extractCodeText(child);
                if (!text) continue;
                if (block && parts.length > 0) parts.push('\n');
                parts.push(text);
                if (block) parts.push('\n');
            }
            return parts.join('').replace(/\n{3,}/g, '\n\n');
        };
        const htmlToMd = (node) => {
            if (!node) return '';
            if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
            if (node.nodeType !== Node.ELEMENT_NODE) return '';
            const tag = node.tagName;
            if (tag === 'STYLE' || tag === 'SCRIPT' || tag === 'SVG') return '';
            if (tag === 'BR') return '\n';
            if (tag === 'CODE' && node.parentElement?.tagName !== 'PRE') {
                return '`' + extractCodeText(node).replace(/`/g, '\\`') + '`';
            }
            if (tag === 'PRE') {
                return `\n\n\0\u0006\n${extractCodeText(node).trim()}\n\0\u0006\n\n`;
            }
            if (tag === 'A') {
                const text = normalize(Array.from(node.childNodes).map(htmlToMd).join('')) || normalize(node.textContent);
                const href = node.getAttribute('href') || '';
                return href ? `[${text || href}](${href})` : text;
            }
            if (tag === 'TABLE') {
                const rows = Array.from(node.querySelectorAll('tr')).map(tr => Array.from(tr.querySelectorAll('th,td')).map(cell => normalize(cell.textContent).replace(/\|/g, '\\|')));
                if (!rows.length) return '';
                const colCount = Math.max(...rows.map(row => row.length));
                const header = rows[0].concat(Array(Math.max(0, colCount - rows[0].length)).fill(''));
                const body = rows.slice(1).map(row => row.concat(Array(Math.max(0, colCount - row.length)).fill('')));
                const divider = Array(colCount).fill('---');
                return '\n' + ['| ' + header.join(' | ') + ' |', '| ' + divider.join(' | ') + ' |', ...body.map(row => '| ' + row.join(' | ') + ' |')].join('\n') + '\n';
            }
            const children = Array.from(node.childNodes).map(htmlToMd).join('');
            if (tag === 'P') return children.trim() + '\n\n';
            if (tag === 'LI') return '- ' + children.trim() + '\n';
            if (tag === 'UL' || tag === 'OL') return '\n' + children + '\n';
            if (/H[1-6]/.test(tag)) return '\n' + '#'.repeat(Number(tag[1])) + ' ' + normalize(node.textContent) + '\n\n';
            return children;
        };
        const getCopyableText = (node) => {
            if (!node) return '';
            const nodes = [node, ...node.querySelectorAll('*')].slice(0, 80);
            for (const candidate of nodes) {
                const key = Object.keys(candidate).find(name => name.startsWith('__reactFiber'));
                if (!key) continue;
                let fiber = candidate[key];
                for (let depth = 0; fiber && depth < 15; depth += 1, fiber = fiber.return) {
                    const props = fiber.memoizedProps || fiber.pendingProps || {};
                    if (typeof props.copyableText === 'string' && props.copyableText.trim()) {
                        return props.copyableText.trim();
                    }
                }
            }
            return '';
        };
        const getCleanMd = (node) => htmlToMd(node)
            .replace(/\u00060\u0006/g, '```')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/[ \t]+\n/g, '\n')
            .trim();

        const collectApprovalActions = () => {
            const dialogs = [document.querySelector('.monaco-dialog-box, [role="dialog"]'), cascade].filter(Boolean);
            const actionNames = [];
            for (const root of dialogs) {
                const buttons = Array.from(root.querySelectorAll('button, [role="button"], .monaco-button')).filter(isVisible);
                for (const button of buttons) {
                    const label = normalize(button.innerText || button.textContent || button.getAttribute('aria-label'));
                    if (!label || label.length > 40) continue;
                    if (!/^(run|skip|accept|reject|approve|allow|deny)\b/i.test(label)) continue;
                    if (!actionNames.some(existing => existing.toLowerCase() === label.toLowerCase())) {
                        actionNames.push(label);
                    }
                }
            }
            return actionNames;
        };

        const approvalActions = collectApprovalActions();
        let status = 'idle';
        let activeModal = null;

        if (approvalActions.length > 0) {
            status = 'waiting_approval';
            activeModal = {
                message: normalize(cascade.querySelector('button')?.closest('[class*="terminal"],[class*="shadow-step"],.monaco-dialog-box,[role="dialog"]')?.innerText || 'Approval required'),
                actions: approvalActions,
            };
        } else {
            const stopButton = Array.from(cascade.querySelectorAll('button, [role="button"]')).find(el => {
                if (!isVisible(el)) return false;
                const text = normalize(el.innerText || el.textContent || el.getAttribute('aria-label'));
                return /^(stop|cancel generation|stop generating)\b/i.test(text);
            });
            const spinnerSignal = Array.from(cascade.querySelectorAll('*')).some(el => {
                if (!isVisible(el)) return false;
                const cls = String(el.className || '');
                return /animate-spin|animate-pulse|animate-bounce|loading-spinner|lucide-loader|stream/i.test(cls);
            });
            const stateLabelSignal = Array.from(cascade.querySelectorAll('*')).some(el => {
                if (!isVisible(el)) return false;
                if (el.children.length > 2) return false;
                if (el.closest('[class*="popover"], [class*="tooltip"], [data-radix-popper-content-wrapper]')) return false;
                const text = normalize(el.innerText || el.textContent || el.getAttribute('aria-label'));
                return text.length > 0 && text.length <= 30 && /^(thinking|generating|sailing|loading)\b/i.test(text);
            });
            if (fiberRunning || stopButton || spinnerSignal || stateLabelSignal) {
                status = 'generating';
            }
        }

        const scroll = cascade.querySelector('.cascade-scrollbar');
        const candidates = scroll
            ? Array.from(scroll.querySelectorAll('div')).filter(el => String(el.className || '').includes('flex flex-col gap-2.5') && el.children.length > 0)
            : [];
        const listRoot = candidates.sort((left, right) => right.children.length - left.children.length)[0] || null;

        const messages = [];
        const seen = new Set();
        if (listRoot) {
            for (const child of Array.from(listRoot.children)) {
                if (!isVisible(child)) continue;
                const rawText = normalize(child.innerText || child.textContent);
                if (!rawText) continue;
                if ((child.className || '').includes('mark-js-ignore') || /feedback submitted/i.test(rawText)) continue;

                readFiberValue(child);

                const isUser = !!child.querySelector('.justify-end');
                let kind = 'standard';
                if (/Command\b/i.test(rawText) || child.querySelector('.terminal-text, [class*="bg-ide-terminal-background"]')) {
                    kind = 'terminal';
                } else if (/tasks done|Created Todo List|\bnew\b \+\d+|shadow-step/i.test(rawText + ' ' + (child.innerHTML || ''))) {
                    kind = 'tool';
                } else if (!isUser && /step-by-step reasoning|reasoning process|thought process/i.test(rawText)) {
                    kind = 'thought';
                }

                let content = '';
                if (isUser) {
                    const bubble = child.querySelector('[class*="whitespace-pre-wrap"]') || child;
                    content = normalize(bubble.innerText || bubble.textContent);
                } else if (kind === 'terminal') {
                    const label = normalize(child.querySelector('.codeium-text-medium')?.textContent || 'Command');
                    const command = normalize(child.querySelector('.terminal-text,.whitespace-pre-wrap,.monaco-tokenized-source')?.textContent || rawText)
                        .replace(/\bRun\b.*$/i, '')
                        .replace(/\bSkip\b.*$/i, '')
                        .trim();
                    content = `${label}\n\n\0\u0006sh\n${command}\n\0\u0006`.replace(/\u00060\u0006/g, '```');
                } else if (kind === 'tool') {
                    content = cleanText(rawText);
                } else {
                    const prose = child.querySelector('.prose');
                    content = getCopyableText(child) || getCleanMd(prose || child) || cleanText(rawText);
                }

                content = content.replace(/\n{3,}/g, '\n\n').trim();
                if (!content) continue;

                const hash = `${isUser ? 'user' : 'assistant'}:${kind}:${content.slice(0, 240)}`;
                if (seen.has(hash)) continue;
                seen.add(hash);

                const message = {
                    role: isUser ? 'user' : 'assistant',
                    content: content.length > 12000 ? `${content.slice(0, 12000)}\n[... truncated]` : content,
                    index: messages.length,
                };
                if (kind !== 'standard') message.kind = kind;
                if (kind === 'terminal') {
                    message.meta = {
                        label: normalize(child.querySelector('.codeium-text-medium')?.textContent || 'Command'),
                        isRunning: status === 'generating' && /command/i.test(content),
                    };
                }
                messages.push(message);
            }
        }

        const editor = cascade.querySelector('[data-lexical-editor="true"]')
            || cascade.querySelector('[contenteditable="true"][role="textbox"]')
            || cascade.querySelector('textarea:not(.xterm-helper-textarea)');
        const inputContent = normalize(editor?.innerText || editor?.value || '');

        if (status === 'idle' && fiberPendingCommand && approvalActions.length > 0) {
            status = 'waiting_approval';
        }

        return JSON.stringify({
            id: cascadeId,
            status,
            title,
            messages,
            inputContent,
            activeModal,
        });
    } catch (e) {
        return JSON.stringify({ id: 'error', status: 'idle', title: 'Cascade', messages: [], inputContent: '', activeModal: null, error: e.message });
    }
})()
