/**
 * Antigravity v1 — read_chat (v4 — scroll , area )
 * 
 * :
 * - scrollis ( )
 * - use ignore
 * - current (latest )
 * 
 * DOM structure:
 *   User: bg-gray-500/15 + select-text + p-2, inside whitespace-pre-wrap
 * : .leading-relaxed.select-text
 */
(() => {
    try {
        const conv = document.querySelector('#conversation') || document.querySelector('.antigravity-agent-side-panel') || document.body;
        const scroll = conv.querySelector('.overflow-y-auto') || conv;

        // 1. status detection — Based on Send/Stop button at bottom of sidebar (prevent false positives)
        let status = 'idle';

 // A (1st priority): Red Stop square (.bg-red-500) — generating displayed when generating
        const stopSquare = conv.querySelector('[class*="bg-red-500"]') || conv.querySelector('button[class*="rounded"] [class*="bg-red"]');
        if (stopSquare && stopSquare.offsetWidth > 0) {
            status = 'generating';
        }

 // Signal B: conv inside animate-markdown (create markdown rendering during creation)
        if (status === 'idle') {
            const animMarkdown = scroll.querySelector('.leading-relaxed [class*="animate-markdown"]');
            if (animMarkdown && animMarkdown.offsetWidth > 0) status = 'generating';
        }

        const titleParts = document.title.split(' \u2014 ');
        const title = (titleParts.length >= 2 ? titleParts[titleParts.length - 1] : titleParts[0] || '').trim() || 'Active Session';

        // ─── HTML → Markdown converter (Dashboard uses ReactMarkdown+remarkGfm) ───
        // extractCodeText: layout-independent code text extraction
        // Works on cloneNode'd (detached) elements where innerText == textContent
        // Walks child nodes and inserts \n between block-level elements (DIV, P, etc.)
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
            // Collapse multiple consecutive newlines into single \n
            return parts.join('').replace(/\n{2,}/g, '\n');
        }
        function htmlToMd(node) {
            if (node.nodeType === 3) return node.textContent || '';
            if (node.nodeType !== 1) return '';
            const tag = node.tagName;

            // Remove styles/scripts
            if (tag === 'STYLE' || tag === 'SCRIPT' || tag === 'SVG') return '';

            // Table → GFM
            if (tag === 'TABLE') {
                const rows = Array.from(node.querySelectorAll('tr'));
                if (rows.length === 0) return '';
                const table = rows.map(tr =>
                    Array.from(tr.querySelectorAll('th, td')).map(cell => (cell.textContent || '').trim().replace(/\|/g, '\\|'))
                );
                if (table.length === 0) return '';
                const colCount = Math.max(...table.map(r => r.length));
                const header = table[0];
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
                // Custom extraction: walk child nodes and insert \n between block elements
                // This works on cloneNode'd elements (no layout → innerText == textContent)
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
            // Remove noise
            clone.querySelectorAll('button, [role="button"], style, script, svg, .codicon, [class*="feedback"], [aria-label*="Good"], [aria-label*="Bad"]').forEach(n => n.remove());
            // Remove status text (leaf only, 60 chars or less)
            clone.querySelectorAll('*').forEach(child => {
                if (!child.parentNode) return;
                const t = (child.textContent || '').trim();
                if (t.length > 60) return;
                const low = t.toLowerCase();
                if (/^(analyzed\s+\d|edited\s+\d|ran\s+\S|terminal\s|reading|searching)/i.test(low)) child.remove();
                if (/^(mcp|customizationmcp|serversexport)/i.test(low)) child.remove();
            });
            let md = htmlToMd(clone);
            // Remove "Thought for X seconds"
            md = md.replace(/^Thought for\s+[\d.]+\s*(seconds?|s)\s*/i, '');
            md = md.replace(/\n{3,}/g, '\n\n').trim();
            return md;
        }

        // 2. Collect messages (scroll No manipulation — current DOMonly those in)
        const collected = [];
        const seenHashes = new Set();

 // use (bg-gray-500/15 + select-text + p-2)
        const allDivs = scroll.querySelectorAll('div');
        for (const el of allDivs) {
            const cls = (el.className || '');
            if (typeof cls !== 'string') continue;
            if (cls.includes('bg-gray-500/15') && cls.includes('select-text') && cls.includes('p-2')) {
                const textEl = el.querySelector('[class*="whitespace-pre-wrap"]') || el;
                const text = (textEl.innerText || '').trim();
                if (!text || text.length < 1) continue;
                const hash = 'user:' + text.slice(0, 200);
                if (seenHashes.has(hash)) continue;
                seenHashes.add(hash);
                collected.push({ role: 'user', text, el, kind: 'standard' });
            }
        }

 // (leading-relaxed.select-text) — HTML→Markdown conversion
        const assistantBlocks = scroll.querySelectorAll('.leading-relaxed.select-text');
        for (const ab of assistantBlocks) {
            if (ab.offsetHeight < 10) continue;
            if (ab.closest('[class*="max-h-"][class*="overflow-y-auto"]')) continue;
            // Exclude blocks inside Thought (collected separately as thinking)
            if (ab.closest('.isolate')?.querySelector('button')?.textContent?.startsWith('Thought for')) continue;

            let text = getCleanMd(ab);
            if (!text || text.length < 2) continue;
            if (/^(Running command|Checked command|collectStatus)/i.test(text)) continue;

            const hash = 'assistant:' + text.slice(0, 200);
            if (seenHashes.has(hash)) continue;
            seenHashes.add(hash);
            collected.push({ role: 'assistant', text, el: ab, kind: 'standard' });
        }

        // ─── Thought collection (AI thought process) ───
        const thoughtBtns = scroll.querySelectorAll('button');
        for (const btn of thoughtBtns) {
            const label = (btn.textContent || '').trim();
            if (!label.startsWith('Thought for')) continue;
            const sibling = btn.nextElementSibling;
            if (!sibling) continue;
            // Actual thinking text is in .leading-relaxed.select-text inside sibling
            const contentEl = sibling.querySelector('.leading-relaxed.select-text');
            if (!contentEl) continue;
            const clone = contentEl.cloneNode(true);
            clone.querySelectorAll('button, svg, style, script, [role="button"]').forEach(n => n.remove());
            const thinkText = (clone.innerText || clone.textContent || '').trim();
            if (!thinkText || thinkText.length < 5) continue;
            const hash = 'think:' + thinkText.slice(0, 200);
            if (seenHashes.has(hash)) continue;
            seenHashes.add(hash);
            // Pass plain text only (markdown format handled by frontend)
            collected.push({ role: 'assistant', text: thinkText.slice(0, 3000), el: btn, kind: 'thought', meta: { label } });
        }

        // ─── Terminal/Tool Call collection (command execute result) ───
        const termHeaders = scroll.querySelectorAll('div.mb-1.px-2.py-1');
        for (const h of termHeaders) {
            const spanEl = h.querySelector('span');
            const label = (spanEl?.textContent || '').trim();
            if (!label.match(/^(Ran|Running) command/i)) continue;
            const parent = h.parentElement;
            if (!parent) continue;
            const pre = parent.querySelector('pre');
            const cmdText = (pre?.textContent || '').trim();
            if (!cmdText || cmdText.length < 2) continue;
            const hash = 'term:' + cmdText.slice(0, 200);
            if (seenHashes.has(hash)) continue;
            seenHashes.add(hash);
            // Pass plain text only (labels/icons handled by frontend)
            const isRunning = label.startsWith('Running');
            collected.push({ role: 'assistant', text: cmdText.slice(0, 3000), el: h, kind: 'terminal', meta: { label, isRunning } });
        }

 // ─── Tool Call summary collection (Searched, Analyzed, Edited ) ───
        const toolDivs = scroll.querySelectorAll('div[data-tooltip-id]');
        for (const td of toolDivs) {
            const cls = (td.className || '').toString();
            if (!cls.includes('cursor-pointer') || !cls.includes('text-sm')) continue;
 // Read per-span and join with spaces (textContent "SearchedDevServer"attached like)
            const spans = td.querySelectorAll('span');
            const text = spans.length > 0
                ? Array.from(spans).map(s => (s.textContent || '').trim()).filter(Boolean).join(' ')
                : (td.textContent || '').trim();
            if (!text.match(/^(Searched|Analyzed|Edited|Read|Viewed|Created|Listed|Checked)/)) continue;
            if (text.length > 120) continue;
            const hash = 'tool:' + text;
            if (seenHashes.has(hash)) continue;
            seenHashes.add(hash);
            // Concise one-line summary
            collected.push({ role: 'assistant', text: text, el: td, kind: 'tool' });
        }

        // 3. DOM Order sorting
        collected.sort((a, b) => {
            const pos = a.el.compareDocumentPosition(b.el);
            if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
            if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
            return 0;
        });

        // latest 50only keep (thinking/tool_use increased to include)
        const trimmed = collected.length > 50 ? collected.slice(-50) : collected;

        const final = trimmed.map((m, i) => ({
            id: 'msg_' + i,
            role: m.role,
            content: m.text.length > 6000 ? m.text.slice(0, 6000) + '\n[... truncated]' : m.text,
            index: i,
            kind: m.kind || 'standard',
            meta: m.meta || undefined,
            vsc_history: true
        }));

        // 4. input field
        const editor = conv.querySelector('[contenteditable="true"][role="textbox"]') ||
            conv.querySelector('[data-lexical-editor="true"]') ||
            conv.querySelector('textarea');
        const inputContent = editor ? (editor.innerText || editor.value || '').trim() : '';

 // 5. modal/approval detect — Run⌥⏎/Reject + Deny/Allow browser approval
        let activeModal = null;
        try {
            // Strip Mac symbols and Windows shortcut labels (e.g. "RunAlt+⏎" → "Run")
            const stripShortcut = (s) => s
                .replace(/[⌥⏎⇧⌫⌘⌃↵]/g, '')
                .replace(/\s*(Alt|Ctrl|Shift|Cmd|Enter|Return|Esc|Tab|Backspace)(\+\s*\w+)*/gi, '')
                .trim();
            const isApprovalLike = (el) => {
                const raw = (el.textContent || '').trim();
                const t = stripShortcut(raw).toLowerCase();
                // Exclude dropdown options
                if (t === 'ask every time') return false;
                return /^(run|reject|skip|approve|allow|deny|cancel|accept|yes|no)\b/i.test(t)
                    || t === 'always allow' || t === 'always deny'
                    || t.includes('run ') || t.includes('approve') || t.includes('reject')
                    || t.includes('skip');
            };
 // A: modal 
            const dialog = document.querySelector('.monaco-dialog-box, [role="dialog"], .monaco-modal-block');
            if (dialog && dialog.offsetWidth > 80 && dialog.offsetHeight > 40) {
                const msg = (dialog.querySelector('.dialog-message, .dialog-message-text') || dialog).innerText?.trim() || '';
                const buttons = Array.from(dialog.querySelectorAll('.monaco-button, button'))
                    .map(b => (b.innerText || '').trim())
                    .filter(t => t.length > 0 && t.length < 30);
                if (msg || buttons.length > 0) {
                    activeModal = { message: msg.slice(0, 300), buttons, width: dialog.offsetWidth, height: dialog.offsetHeight };
                }
            }
 // B: approval button (Run⌥⏎, Reject, Deny, Allow )
            // ⚠ Only check buttons inside sidebar (conv) — exclude editor Accept/Reject Changes
            if (!activeModal) {
                const panelBtns = Array.from(conv.querySelectorAll('button')).filter(b => b.offsetWidth > 0 && b.offsetHeight > 0);
                const approvalBtns = panelBtns.filter(isApprovalLike);
                if (approvalBtns.length > 0) {
                    const hasActionBtn = approvalBtns.some(b => {
                        const t = stripShortcut((b.textContent || '').trim()).toLowerCase();
                        return /^(run|reject|skip|deny|allow|accept|approve|yes|no)\b/.test(t)
                            || t === 'always allow' || t === 'always deny';
                    });
                    if (hasActionBtn) {
                        const btnTexts = [...new Set(
                            approvalBtns.map(b => (b.textContent || '').trim())
                                .filter(t => t.length > 0 && t.length < 40)
                        )];
                        const firstApproval = approvalBtns[0];
                        let wrapper = firstApproval.parentElement;
                        for (let up = 0; up < 5 && wrapper; up++, wrapper = wrapper.parentElement) {
                            if (wrapper.offsetHeight > 40) break;
                        }
                        const msg = wrapper ? (wrapper.textContent || '').trim().slice(0, 300) : '';
                        activeModal = { message: msg, buttons: btnTexts, width: 400, height: 100 };
                    }
                }
            }
 // C: footer based usage/quota (Dismiss / See Plans / Enable Overages )
 // <footer> element conv exists 2 button considered a card requiring user action
            if (!activeModal) {
                const footers = Array.from(conv.querySelectorAll('footer')).filter(f => f.offsetWidth > 0 && f.offsetHeight > 0);
                for (const footer of footers) {
                    const footerBtns = Array.from(footer.querySelectorAll('button, a')).filter(b => b.offsetWidth > 0);
                    if (footerBtns.length >= 2) {
                        // Card Container: First element with sufficient height above footer
                        let card = footer.parentElement;
                        for (let up = 0; up < 4 && card; up++) {
                            if (card.offsetHeight > 60) break;
                            card = card.parentElement;
                        }
                        const msg = card ? (card.innerText || '').trim().slice(0, 300) : '';
                        const btnTexts = footerBtns.map(b => (b.innerText || '').trim()).filter(t => t.length > 0 && t.length < 40);
                        if (btnTexts.length >= 2) {
                            activeModal = { message: msg, buttons: btnTexts, width: card ? card.offsetWidth : 300, height: card ? card.offsetHeight : 100 };
                            break;
                        }
                    }
                }
            }
            // If modal detected, change status to waiting_approval
            if (activeModal) status = 'waiting_approval';
        } catch (e) { activeModal = null; }

        return { id: 'active_session', status, title, messages: final, inputContent, activeModal };
    } catch (e) {
        return { id: 'error', status: 'error', error: e.message, messages: [] };
    }
})()
