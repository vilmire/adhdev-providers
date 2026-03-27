/**
 * Cursor — read_chat (v2 — thoughts, tools, terminal, DOM-ordered)
 *
 * DOM 구조 (v0.49):
 *   컴포저: [data-composer-id] + [data-composer-status]
 *   메시지 쌍: .composer-human-ai-pair-container
 *   사용자: .composer-human-message
 *   AI 텍스트: .composer-rendered-message (assistant content)
 *   사고: .ui-step-group-collapsible → header에 "Thought briefly" 등
 *   도구: .composer-tool-former-message (file edits, reads)
 *   코드블록: .composer-code-block-container (terminal commands)
 *   Diff: .composer-diff-block (code changes)
 *   승인: .run-command-review-active + button/cursor-pointer 요소
 *
 * → { id, status, title, messages[], inputContent, activeModal }
 */
(() => {
  try {
    const c = document.querySelector('[data-composer-id]');
    const id = c?.getAttribute('data-composer-id') || 'active';
    const rawStatus = c?.getAttribute('data-composer-status') || 'idle';
    let status = rawStatus;
    if (rawStatus === 'thinking' || rawStatus === 'streaming') status = 'generating';
    else if (rawStatus === 'completed' || rawStatus === 'cancelled' || rawStatus === 'idle' || !rawStatus) status = 'idle';

    // ─── Approval Detection ───
    let activeModal = null;
    const reviewActive = !!document.querySelector('.run-command-review-active');
    const clickableEls = [...document.querySelectorAll('button, [role="button"], .cursor-pointer')].filter(b =>
      b.offsetWidth > 0 && /^(accept|reject|approve|deny|run|skip|allow|cancel)/i.test((b.textContent || b.getAttribute('aria-label') || '').trim())
    );
    if (reviewActive || clickableEls.length > 0) {
      status = 'waiting_approval';
      const reviewContainer = document.querySelector('.run-command-review-active');
      const renderedMsgs = reviewContainer?.querySelectorAll('.composer-rendered-message');
      const lastRendered = renderedMsgs?.length ? renderedMsgs[renderedMsgs.length - 1] : null;
      const toolMsg = lastRendered || reviewContainer?.querySelector('.composer-tool-former-message:last-of-type');
      activeModal = {
        message: toolMsg?.textContent?.trim()?.substring(0, 200) || 'Command approval required',
        buttons: clickableEls.map(b => b.textContent.trim().replace(/[⏎↵]/g, '').trim()).filter(Boolean),
      };
    }

    // ─── Message Collection ───
    const collected = [];
    const seenHashes = new Set();

    // Markdown Extractor to preserve tables/lists structure properly instead of flat innerText
    function extractMarkdown(node) {
      if (!node) return '';
      if (node.nodeType === 3) return node.textContent; 
      if (node.nodeType !== 1) return ''; 

      const tag = node.tagName.toLowerCase();
      
      // Stop extracting into nested block containers that we already process as separate items
      if (node.classList && (
          node.classList.contains('composer-tool-former-message') ||
          node.classList.contains('composer-code-block-container') ||
          node.classList.contains('composer-diff-block')
      )) {
          return '';
      }

      let res = '';
      if (tag === 'p' || tag === 'div') {
        for (let i = 0; i < node.childNodes.length; i++) res += extractMarkdown(node.childNodes[i]);
        return res + '\n\n';
      }
      if (/^h[1-6]$/.test(tag)) {
        const level = parseInt(tag.charAt(1), 10);
        for (let i = 0; i < node.childNodes.length; i++) res += extractMarkdown(node.childNodes[i]);
        return '#'.repeat(level) + ' ' + res.trim() + '\n\n';
      }
      if (tag === 'ul' || tag === 'ol') {
        for (let i = 0; i < node.childNodes.length; i++) res += extractMarkdown(node.childNodes[i]);
        return res + '\n';
      }
      if (tag === 'li') {
        for (let i = 0; i < node.childNodes.length; i++) res += extractMarkdown(node.childNodes[i]);
        return '- ' + res.trim() + '\n';
      }
      if (tag === 'strong' || tag === 'b') {
        for (let i = 0; i < node.childNodes.length; i++) res += extractMarkdown(node.childNodes[i]);
        return '**' + res + '**';
      }
      if (tag === 'em' || tag === 'i') {
        for (let i = 0; i < node.childNodes.length; i++) res += extractMarkdown(node.childNodes[i]);
        return '*' + res + '*';
      }
      if (tag === 'code') {
        for (let i = 0; i < node.childNodes.length; i++) res += extractMarkdown(node.childNodes[i]);
        return '`' + res + '`';
      }
      if (tag === 'pre') {
        for (let i = 0; i < node.childNodes.length; i++) res += extractMarkdown(node.childNodes[i]);
        return '\n```\n' + res.trim() + '\n```\n\n';
      }
      if (tag === 'a') {
        let text = '';
        for (let i = 0; i < node.childNodes.length; i++) text += extractMarkdown(node.childNodes[i]);
        return '[' + text + '](' + (node.href || '') + ')';
      }
      if (tag === 'table') {
        for (let i = 0; i < node.childNodes.length; i++) res += extractMarkdown(node.childNodes[i]);
        return '\n' + res.trim() + '\n\n';
      }
      if (tag === 'thead') {
        const tr = node.querySelector('tr');
        if (tr) {
          const ths = Array.from(tr.querySelectorAll('th')).map(th => extractMarkdown(th).trim());
          return '| ' + ths.join(' | ') + ' |\n| ' + ths.map(() => '---').join(' | ') + ' |\n';
        }
        return '';
      }
      if (tag === 'tbody') {
        for (let i = 0; i < node.childNodes.length; i++) res += extractMarkdown(node.childNodes[i]);
        return res;
      }
      if (tag === 'tr' && (!node.parentElement || node.parentElement.tagName.toLowerCase() !== 'thead')) {
        const tds = Array.from(node.querySelectorAll('td')).map(td => extractMarkdown(td).trim().replace(/\n/g, '<br>'));
        return '| ' + tds.join(' | ') + ' |\n';
      }

      // Default
      for (let i = 0; i < node.childNodes.length; i++) res += extractMarkdown(node.childNodes[i]);
      return res;
    }

    document.querySelectorAll('.composer-human-ai-pair-container').forEach((pair) => {
      if (pair.children.length === 0) return; // virtual-scroll placeholder

      // ─── User Message ───
      const humanEl = pair.querySelector('.composer-human-message');
      if (humanEl) {
        const userText = (humanEl.innerText || '').trim().substring(0, 6000);
        if (userText) {
          const hash = 'user:' + userText.slice(0, 200);
          if (!seenHashes.has(hash)) {
            seenHashes.add(hash);
            collected.push({ role: 'user', text: userText, el: humanEl, kind: 'standard' });
          }
        }
      }

      // ─── AI Message Blocks ───
      const aiBlocks = Array.from(pair.querySelectorAll('.composer-assistant-message, [data-message-role="ai"], [data-message-role="assistant"]'));
      for (const block of aiBlocks) {

        // ─── Thinking ("Thought briefly", etc) ───
        const uiStepGroup = block.querySelectorAll('.ui-step-group-collapsible, [class*="collapsible"]');
        if (uiStepGroup.length > 0) {
          uiStepGroup.forEach(group => {
            const collapsibleHeader = group.querySelector('.ui-collapsible-header');
            const spans = collapsibleHeader?.querySelectorAll('span');
            const headerText = spans && spans.length > 0
              ? Array.from(spans).map(s => (s.textContent || '').trim()).filter(Boolean).join(' ')
              : (collapsibleHeader?.innerText || collapsibleHeader?.textContent || '').trim();

            // "Thought briefly", "Thought for Xs" — thinking content
            if (headerText && /thought/i.test(headerText)) {
              // Try to get expanded thought content
              const contentEl = block.querySelector('.ui-collapsible-content, [class*="collapsible-content"]');
              const thinkText = contentEl ? (contentEl.innerText || '').trim() : '';
              const label = headerText;
              const hash = 'think:' + (thinkText || headerText).slice(0, 200);
              
              if (!seenHashes.has(hash)) {
                seenHashes.add(hash);
                // Prepend thinking into collected as a special block
                let combined = `> **${label}**\n> \n`;
                if (thinkText) {
                  combined += thinkText.split('\n').map(l => `> ${l}`).join('\n');
                } else {
                  combined += '> ...\n'; // collapsed
                }
                collected.push({ role: 'assistant', text: combined, el: group, kind: 'thought' });
              }
            }
          });
          // Note: If the entire block is just a thought, maybe continue, but usually there's rendered text after.
        }

        // ─── Tools (Reads, Edits, etc) ───
        const toolMsgs = block.querySelectorAll('.composer-tool-former-message');
        if (toolMsgs.length > 0) {
          toolMsgs.forEach(tm => {
            let cleanText = '';
            // For file modifications/reads, try to just grab the file path (first line)
            // It usually looks like: "MachineDetail.tsx+3-1  Read file"
            const rawText = (tm.innerText || '').trim();
            if (rawText) {
              cleanText = rawText.split('\n')[0].substring(0, 80)
                .replace(/(?:Skip|Run|Accept|Reject)(?:Esc)?$/g, '').trim();
              // If it looks like code/JSX, truncate further
              if (/[<>{}()=]/.test(cleanText) && cleanText.length > 50) {
                cleanText = cleanText.substring(0, 50) + '…';
              }
            }
            if (!cleanText || cleanText.length < 2) return;
            const hash = 'tool:' + cleanText;
            if (!seenHashes.has(hash)) {
              seenHashes.add(hash);
              collected.push({ role: 'assistant', text: cleanText, el: tm, kind: 'tool' });
            }
          });
        }

        // ─── Code blocks / Terminal ───
        const codeBlocks = block.querySelectorAll('.composer-code-block-container');
        if (codeBlocks.length > 0) {
          codeBlocks.forEach(cb => {
            let codeText = (cb.textContent || '').trim().substring(0, 3000);
            // Strip button text noise
            codeText = codeText.replace(/(?:Skip|Run|Accept|Reject)(?:Esc|⏎|↵)?\s*$/g, '').trim();
            codeText = codeText.replace(/\n(?:Skip|Run|Accept|Reject)(?:Esc|⏎|↵)?\s*/g, '\n').trim();
            if (codeText.length < 2) return;
            // Detect if it's a terminal command vs code block
            const isTerminal = cb.querySelector('[class*="terminal"]') ||
              cb.closest('.run-command-review-active') ||
              /^\$\s/.test(codeText) ||
              /^(?:cd |npm |node |npx |git |make |docker |curl |wget |ls |cat |mkdir |rm |mv |cp )/i.test(codeText);
            const hash = (isTerminal ? 'term:' : 'code:') + codeText.slice(0, 200);
            if (!seenHashes.has(hash)) {
              seenHashes.add(hash);
              // For terminal: extract first line as label
              const label = isTerminal ? codeText.split('\n')[0].substring(0, 100) : undefined;
              collected.push({
                role: 'assistant',
                text: codeText,
                el: cb,
                kind: isTerminal ? 'terminal' : 'code',
                label
              });
            }
          });
        }

        // ─── Diff Blocks ───
        const diffBlocks = block.querySelectorAll('.composer-diff-block');
        if (diffBlocks.length > 0) {
          diffBlocks.forEach(db => {
            const diffText = (db.textContent || '').trim().substring(0, 2000);
            if (diffText.length < 5) return;
            const hash = 'diff:' + diffText.slice(0, 200);
            if (!seenHashes.has(hash)) {
              seenHashes.add(hash);
              collected.push({ role: 'assistant', text: diffText, el: db, kind: 'tool' });
            }
          });
        }

        // ─── Rendered assistant message ───
        const rendered = block.classList.contains('composer-rendered-message') ? block : block.querySelector('.composer-rendered-message');
        if (rendered) {
          const t = extractMarkdown(rendered).replace(/\n{3,}/g, '\n\n').trim();
          if (t.length >= 2) {
            // Strip button noise from end
            const clean = t.replace(/(?:Skip|Run|Accept|Reject)(?:Esc)?\s*$/g, '').trim();
            if (clean.length >= 2) {
              const hash = 'assistant:' + clean.slice(0, 200);
              if (!seenHashes.has(hash)) {
                seenHashes.add(hash);
                collected.push({ role: 'assistant', text: clean.substring(0, 6000), el: rendered, kind: 'standard' });
              }
            }
          }
          continue;
        }

        // ─── Fallback: any remaining text block ───
        const t = (block.innerText || '').trim();
        if (t.length < 2) continue;
        // Filter noise
        if (/^Thought\nfor \d+s?$/i.test(t) || /^Explored\n/i.test(t)) continue;
        if (/^.{1,80}\n\d+s$/.test(t) && !t.includes('\n\n')) continue;

        const hash = 'other:' + t.slice(0, 200);
        if (!seenHashes.has(hash)) {
          seenHashes.add(hash);
          collected.push({ role: 'assistant', text: t.substring(0, 6000), el: block, kind: 'standard' });
        }
      }
    });

    // ─── DOM Order Sort ───
    collected.sort((a, b) => {
      const pos = a.el.compareDocumentPosition(b.el);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    // Keep last 50 messages
    const trimmed = collected.length > 50 ? collected.slice(-50) : collected;

    const messages = trimmed.map((m, i) => ({
      id: 'msg_' + i,
      role: m.role,
      content: m.text.length > 6000 ? m.text.slice(0, 6000) + '\n[... truncated]' : m.text,
      index: i,
      kind: m.kind || 'standard',
      meta: m.meta || undefined,
    }));

    // ─── Input Content ───
    const inputEl = document.querySelector('.aislash-editor-input[contenteditable="true"]');
    const inputContent = inputEl?.textContent?.trim() || '';

    // ─── Title ───
    const titleParts = document.title.split(' — ');
    const projectTitle = (titleParts.length >= 2 ? titleParts[titleParts.length - 1] : titleParts[0] || '').trim();

    return JSON.stringify({ id, status, title: projectTitle, messages, inputContent, activeModal });
  } catch(e) {
    return JSON.stringify({ id: '', status: 'error', error: e.message, messages: [] });
  }
})()
