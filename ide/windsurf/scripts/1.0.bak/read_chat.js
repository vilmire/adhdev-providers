/**
 * Windsurf v1 — read_chat (v1 — Cascade DOM + Fiber)
 * 
 * Windsurf VS Code fork, chat UI is "Cascade"is called.
 * 
 * DOM structure:
 *   #windsurf.cascadePanel → .chat-client-root
 *   scroll: .cascade-scrollbar
 * list: .cascade-scrollbar .pb-20 > .flex.flex-col > .flex.flex-col.gap-2\.5
 * use : hasProse=false, hasWhitespace=true
 * AI : [class*="prose"] (prose-sm)
 * UI: .mark-js-ignore (ignore)
 *   input: [data-lexical-editor="true"]
 *   
 * Fiber props:
 *   cascadeId: session ID
 * isRunning: create status
 *   hasPendingTerminalCommand: approval wait
 * copyableText: AI response source
 * 
 * final Check: Windsurf (2026-03-06)
 */
(() => {
    try {
        // ─── 1. Container ───
        const cascade = document.querySelector('#windsurf\\.cascadePanel')
            || document.querySelector('.chat-client-root');
        if (!cascade) {
            return { id: 'no_cascade', status: 'idle', title: 'No Cascade', messages: [], inputContent: '', activeModal: null };
        }

        // ─── 2. Extract cascadeId, isRunning from Fiber (search from turn elements) ───
        let cascadeId = 'cascade';
        let isRunning = false;
        let hasPendingCmd = false;
        try {
            // Search Fiber from turn elements (cascadeId found at depth 6 from cascadePanel root)
            const scrollArea = cascade.querySelector('.cascade-scrollbar');
            const gapEls = scrollArea ? scrollArea.querySelectorAll('[class*="gap-2"]') : [];
            let firstTurn = null;
            for (const el of gapEls) {
                if (el.children.length >= 1 && el.closest('.cascade-scrollbar')) {
                    firstTurn = el.children[0]; break;
                }
            }
            const fiberTarget = firstTurn || cascade;
            const fk = Object.keys(fiberTarget).find(k => k.startsWith('__reactFiber'));
            if (fk) {
                let fiber = fiberTarget[fk];
                for (let d = 0; d < 50 && fiber; d++) {
                    const p = fiber.memoizedProps || fiber.pendingProps || {};
                    if (p.cascadeId && typeof p.cascadeId === 'string') cascadeId = p.cascadeId;
                    if (p.isRunning === true) isRunning = true;
                    if (p.hasPendingTerminalCommand === true) hasPendingCmd = true;
                    fiber = fiber.return;
                }
            }
        } catch (_) { }

        // ─── 3. status detection ───
        let status = 'idle';
        if (isRunning) status = 'generating';

        // Signal A: Stop button
        if (status === 'idle') {
            const allBtns = Array.from(document.querySelectorAll('button'));
            const stopBtn = allBtns.find(b => {
                if (b.offsetWidth === 0) return false;
                const label = (b.getAttribute('aria-label') || '').toLowerCase();
                const text = (b.textContent || '').trim().toLowerCase();
                return label.includes('stop') || label === 'cancel generation'
                    || text === 'stop' || text === 'stop generating';
            });
            if (stopBtn) status = 'generating';
        }

        // Signal B: input field placeholder
        if (status === 'idle') {
            const editor = cascade.querySelector('[data-lexical-editor="true"]');
            if (editor) {
                const ph = (editor.getAttribute('placeholder') || '').toLowerCase();
                if (ph.includes('wait') || ph.includes('generating')) status = 'generating';
            }
        }

        const titleParts = document.title.split(' \u2014 ');
        const title = (titleParts.length >= 2 ? titleParts[titleParts.length - 1] : titleParts[0] || '').trim() || 'Cascade';

        // ─── 4. HTML → Markdown converter ───
        const BLOCK_TAGS = new Set(['DIV', 'P', 'BR', 'LI', 'TR', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER']);
        function extractCodeText(node) {
            if (node.nodeType === 3) return node.textContent || '';
            if (node.nodeType !== 1) return '';
            if (node.tagName === 'BR') return '\n';
            const parts = [];
            for (const child of node.childNodes) {
                const isBlock = child.nodeType === 1 && BLOCK_TAGS.has(child.tagName);
                const text = extractCodeText(child);
                if (text) {
                    if (isBlock && parts.length > 0) parts.push('\n');
                    parts.push(text);
                    if (isBlock) parts.push('\n');
                }
            }
            return parts.join('').replace(/\n{2,}/g, '\n');
        }
        function htmlToMd(node) {
            if (node.nodeType === 3) return node.textContent || '';
            if (node.nodeType !== 1) return '';
            const tag = node.tagName;
            if (tag === 'STYLE' || tag === 'SCRIPT' || tag === 'SVG') return '';
            if (tag === 'TABLE') {
                const rows = Array.from(node.querySelectorAll('tr'));
                if (rows.length === 0) return '';
                const table = rows.map(tr =>
                    Array.from(tr.querySelectorAll('th, td')).map(cell => (cell.textContent || '').trim().replace(/\|/g, '\\|'))
                );
                const colCount = Math.max(...table.map(r => r.length));
                const header = table[0] || [];
                const sep = Array(colCount).fill('---');
                const body = table.slice(1);
                let md = '| ' + header.join(' | ') + ' |\n';
                md += '| ' + sep.join(' | ') + ' |\n';
                for (const row of body) {
                    while (row.length < colCount) row.push('');
                    md += '| ' + row.join(' | ') + ' |\n';
                }
                return '\n' + md + '\n';
            }
            if (tag === 'UL') return '\n' + Array.from(node.children).map(li => '- ' + childrenToMd(li).trim()).join('\n') + '\n';
            if (tag === 'OL') return '\n' + Array.from(node.children).map((li, i) => (i + 1) + '. ' + childrenToMd(li).trim()).join('\n') + '\n';
            if (tag === 'LI') return childrenToMd(node);
            if (tag === 'H1') return '\n# ' + childrenToMd(node).trim() + '\n';
            if (tag === 'H2') return '\n## ' + childrenToMd(node).trim() + '\n';
            if (tag === 'H3') return '\n### ' + childrenToMd(node).trim() + '\n';
            if (tag === 'H4') return '\n#### ' + childrenToMd(node).trim() + '\n';
            if (tag === 'STRONG' || tag === 'B') return '**' + childrenToMd(node).trim() + '**';
            if (tag === 'EM' || tag === 'I') return '*' + childrenToMd(node).trim() + '*';
            if (tag === 'PRE') {
                const codeEl = node.querySelector('code');
                const lang = codeEl ? (codeEl.className.match(/language-(\w+)/)?.[1] || '') : '';
                const code = extractCodeText(codeEl || node);
                return '\n```' + lang + '\n' + code.trim() + '\n```\n';
            }
            if (tag === 'CODE') {
                if (node.parentElement && node.parentElement.tagName === 'PRE') return node.textContent || '';
                return '`' + (node.textContent || '').trim() + '`';
            }
            if (tag === 'BLOCKQUOTE') return '\n> ' + childrenToMd(node).trim().replace(/\n/g, '\n> ') + '\n';
            if (tag === 'A') return '[' + childrenToMd(node).trim() + '](' + (node.getAttribute('href') || '') + ')';
            if (tag === 'BR') return '\n';
            if (tag === 'P') return '\n' + childrenToMd(node).trim() + '\n';
            return childrenToMd(node);
        }
        function childrenToMd(node) {
            return Array.from(node.childNodes).map(htmlToMd).join('');
        }

        function getCleanMd(el) {
            const clone = el.cloneNode(true);
            clone.querySelectorAll('button, [role="button"], style, script, svg, .codicon, [class*="feedback"]').forEach(n => n.remove());
            clone.querySelectorAll('*').forEach(child => {
                if (!child.parentNode) return;
                const t = (child.textContent || '').trim();
                if (t.length > 60) return;
                const low = t.toLowerCase();
                if (/^(analyzed\s+\d|edited\s+\d|ran\s+\S|terminal\s|reading|searching)/i.test(low)) child.remove();
            });
            let md = htmlToMd(clone);
            md = md.replace(/\n{3,}/g, '\n\n').trim();
            return md;
        }

        // ─── 5. Collect messages ───
        const collected = [];
        const seenHashes = new Set();

        const scrollArea = cascade.querySelector('.cascade-scrollbar');
        if (!scrollArea) {
            return { id: cascadeId, status, title, messages: [], inputContent: '', activeModal: null };
        }

 // list Container search: .gap-2.5 with 2+ children
        let msgContainer = null;
        const gapEls = scrollArea.querySelectorAll('[class*="gap-2"]');
        for (const el of gapEls) {
            if (el.children.length >= 2 && el.closest('.cascade-scrollbar')) {
                msgContainer = el; break;
            }
        }

        if (msgContainer) {
            const turns = Array.from(msgContainer.children);
            for (const turn of turns) {
                // .mark-js-ignore = feedback UI → skip
                if ((turn.className || '').includes('mark-js-ignore')) continue;
                if (turn.offsetHeight < 10) continue;

                // Determine role: .prose = AI, otherwise user
                const proseEl = turn.querySelector('[class*="prose"]');
                const role = proseEl ? 'assistant' : 'user';

                let text = '';
                if (role === 'assistant') {
 // AI: Fiber copyableText use ( !)
                    try {
                        const fk = Object.keys(turn).find(k => k.startsWith('__reactFiber'));
                        if (fk) {
                            let fiber = turn[fk];
                            for (let d = 0; d < 20 && fiber; d++) {
                                const p = fiber.memoizedProps || {};
                                if (p.copyableText && typeof p.copyableText === 'string' && p.copyableText.length > 5) {
                                    text = p.copyableText;
                                    break;
                                }
                                fiber = fiber.return;
                            }
                        }
                    } catch (_) { }

 // In Fiber HTML→Markdown
                    if (!text) {
                        const mdRoot = proseEl || turn;
                        text = getCleanMd(mdRoot);
                    }
                } else {
                    // User: whitespace-pre-wrap elementfrom text extract
                    const whitespace = turn.querySelector('[class*="whitespace"]');
                    text = (whitespace || turn).innerText?.trim() || '';
                }

                if (!text || text.length < 1) continue;

                const hash = role + ':' + text.slice(0, 200);
                if (seenHashes.has(hash)) continue;
                seenHashes.add(hash);
                collected.push({ role, text, el: turn });
            }
        }

        // DOM Order sorting
        collected.sort((a, b) => {
            const pos = a.el.compareDocumentPosition(b.el);
            if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
            if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
            return 0;
        });

        // latest 30only
        const trimmed = collected.length > 30 ? collected.slice(-30) : collected;

        const final = trimmed.map((m, i) => ({
            id: 'msg_' + i,
            role: m.role,
            content: m.text.length > 6000 ? m.text.slice(0, 6000) + '\n[... truncated]' : m.text,
            index: i,
            kind: 'standard'
        }));

        // ─── 6. input field ───
        const editor = cascade.querySelector('[data-lexical-editor="true"]')
            || cascade.querySelector('[contenteditable="true"][role="textbox"]')
            || cascade.querySelector('textarea:not(.xterm-helper-textarea)');
        const inputContent = editor ? (editor.innerText || editor.value || '').trim() : '';

        // ─── 7. modal/approval detect ───
        let activeModal = null;
        try {
            // Fiber: hasPendingTerminalCommand
            if (hasPendingCmd) {
                const allBtns = Array.from(document.querySelectorAll('button')).filter(b => b.offsetWidth > 0);
                const approvalBtns = allBtns.filter(b => {
                    const t = (b.textContent || '').trim().toLowerCase();
                    return /^(run|reject|skip|approve|allow|deny|cancel|accept)\b/i.test(t);
                });
                const btnTexts = [...new Set(approvalBtns.map(b => (b.textContent || '').trim()).filter(t => t.length < 40))];
                activeModal = { message: 'Terminal command pending', buttons: btnTexts.length > 0 ? btnTexts : ['Run', 'Reject'] };
            }

            // Dialog fallback
            if (!activeModal) {
                const dialog = document.querySelector('.monaco-dialog-box, [role="dialog"]');
                if (dialog && dialog.offsetWidth > 80) {
                    const msg = (dialog.querySelector('.dialog-message') || dialog).innerText?.trim() || '';
                    const buttons = Array.from(dialog.querySelectorAll('.monaco-button, button'))
                        .map(b => (b.innerText || '').trim()).filter(t => t.length > 0 && t.length < 30);
                    if (msg || buttons.length > 0) {
                        activeModal = { message: msg.slice(0, 300), buttons };
                    }
                }
            }

            // Inline approval buttons
            if (!activeModal) {
                const allBtns = Array.from(document.querySelectorAll('button')).filter(b => b.offsetWidth > 0);
                const approvalBtns = allBtns.filter(b => {
                    const t = (b.textContent || '').trim().toLowerCase();
                    if (t.length > 40) return false;
                    return /^(run|reject|skip|approve|allow|deny)\b/i.test(t)
                        || t === 'always allow' || t === 'always deny';
                });
                if (approvalBtns.length >= 2) {
                    const btnTexts = [...new Set(approvalBtns.map(b => (b.textContent || '').trim()))];
                    activeModal = { message: '', buttons: btnTexts };
                }
            }

            if (activeModal) status = 'waiting_approval';
        } catch (_) { activeModal = null; }

        return { id: cascadeId, status, title, messages: final, inputContent, activeModal };
    } catch (e) {
        return { id: 'error', status: 'error', error: e.message, messages: [] };
    }
})()
