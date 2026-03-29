(() => {
  try {
    const root = document.querySelector('.interactive-session');
    if (!root) {
      return JSON.stringify({
        id: 'active',
        status: 'idle',
        title: 'Session Not Open',
        messages: [],
        inputContent: '',
        activeModal: null
      });
    }
    const listRoot = root.querySelector('.interactive-list') || root;
    const normalize = (value) => (value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const isVisible = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const isLeaf = (el) => Array.from(el.children || []).every((child) => !isVisible(child) || !normalize(child.textContent));
    const getTitle = () => {
      const selected = document.querySelector('.agent-sessions-viewer .monaco-list-row.selected, .agent-sessions-viewer .monaco-list-row.focused, .agent-sessions-viewer .monaco-list-row[aria-selected="true"]');
      const latestRequest = Array.from(listRoot.querySelectorAll('.monaco-list-row.request')).pop();
      return normalize(
        selected?.querySelector('.monaco-highlighted-label, .label-name, .title, .monaco-icon-label')?.textContent ||
          selected?.getAttribute('aria-label') ||
          latestRequest?.querySelector('.chat-markdown-part, .rendered-markdown')?.textContent ||
          latestRequest?.getAttribute('aria-label') ||
          document.querySelector('.monaco-alert')?.textContent ||
          'New Chat'
      );
    };
    const getInputContent = () => {
      const lines = Array.from(document.querySelectorAll('.interactive-input-editor .view-line')).map((line) => line.textContent || '');
      return lines.join('\n').replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').trim();
    };
    const htmlToMarkdown = (node) => {
      if (!node) return '';
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const tag = node.tagName;

      if (tag === 'BR') return '\n';
      if (tag === 'HR') return '\n---\n';
      if (tag === 'TABLE') {
        const rows = Array.from(node.querySelectorAll('tr')).map((row) =>
          Array.from(row.querySelectorAll('th,td')).map((cell) => normalize(cell.textContent).replace(/\|/g, '\\|'))
        );
        if (!rows.length) return '';
        const width = Math.max(...rows.map((row) => row.length));
        const fillRow = (row) => row.concat(Array(Math.max(0, width - row.length)).fill(''));
        const header = fillRow(rows[0]);
        const body = rows.slice(1).map(fillRow);
        return ['| ' + header.join(' | ') + ' |', '| ' + Array(width).fill('---').join(' | ') + ' |']
          .concat(body.map((row) => '| ' + row.join(' | ') + ' |'))
          .join('\n');
      }
      if (tag === 'PRE') {
        const code = node.querySelector('code') || node;
        const text = (code.textContent || '').replace(/^\n+|\n+$/g, '');
        const langMatch = (code.className || '').match(/language-([\w-]+)/);
        const lang = langMatch ? langMatch[1] : '';
        return '\n```' + lang + '\n' + text + '\n```\n';
      }
      if (tag === 'CODE') return '`' + normalize(node.textContent) + '`';
      if (tag === 'A') {
        const text = normalize(node.textContent);
        const href = node.getAttribute('data-href') || node.getAttribute('href') || '';
        return href ? '[' + (text || href) + '](' + href + ')' : text;
      }
      if (/^H[1-6]$/.test(tag)) {
        return '\n' + '#'.repeat(Number(tag.slice(1))) + ' ' + Array.from(node.childNodes).map(htmlToMarkdown).join('').trim() + '\n';
      }
      if (tag === 'UL') return '\n' + Array.from(node.children).map((child) => '- ' + htmlToMarkdown(child).trim()).join('\n') + '\n';
      if (tag === 'OL') return '\n' + Array.from(node.children).map((child, index) => String(index + 1) + '. ' + htmlToMarkdown(child).trim()).join('\n') + '\n';
      if (tag === 'LI') return Array.from(node.childNodes).map(htmlToMarkdown).join('');
      if (tag === 'STRONG' || tag === 'B') return '**' + Array.from(node.childNodes).map(htmlToMarkdown).join('').trim() + '**';
      if (tag === 'EM' || tag === 'I') return '*' + Array.from(node.childNodes).map(htmlToMarkdown).join('').trim() + '*';
      if (tag === 'P') return Array.from(node.childNodes).map(htmlToMarkdown).join('').trim() + '\n\n';
      return Array.from(node.childNodes).map(htmlToMarkdown).join('');
    };
    const cleanMarkdown = (node) => {
      const clone = node.cloneNode(true);
      clone.querySelectorAll('button, .monaco-toolbar, .chat-codeblock-toolbar, script, style, svg.codicon[aria-hidden="true"], .header, .request-hover, .checkpoint-container, .chat-footer-toolbar, .chat-row-disabled-overlay, .chat-mcp-servers-interaction').forEach((el) => el.remove());
      return htmlToMarkdown(clone)
        .replace(/\n\s*\n\s*\n+/g, '\n\n')
        .replace(/[ \t]+\n/g, '\n')
        .trim();
    };

    const latestResponse = Array.from(listRoot.querySelectorAll('.monaco-list-row.response, .interactive-response')).pop() || root;
    const getButtonLabel = (el) => normalize(el.textContent || el.getAttribute('aria-label') || el.getAttribute('title'));
    const approvalActions = Array.from(latestResponse.querySelectorAll('button, [role="button"], .monaco-button, a[role="button"]'))
      .filter(isVisible)
      .map((el) => getButtonLabel(el))
      .filter((label) => label && /(run|skip|accept|reject|approve|deny|allow|block|continue|proceed)/i.test(label) && !/finished with|more actions|toggle inline|diff editor|retry|copy|helpful|unhelpful|redo/i.test(label));

    let status = 'idle';
    let activeModal = null;
    if (approvalActions.length) {
      status = 'waiting_approval';
      activeModal = { actions: approvalActions };
    } else {
      const generatingButton = Array.from(latestResponse.querySelectorAll('a[role="button"], button, [role="button"]')).find((el) => {
        if (!isVisible(el)) return false;
        const label = normalize(el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent).toLowerCase();
        return /stop|cancel|interrupt|pause generation|stop generating/.test(label);
      });
      const animated = Array.from(latestResponse.querySelectorAll('.monaco-progress-container.active, .codicon-loading, .codicon-sync.codicon-modifier-spin, .chat-animated-ellipsis')).some(isVisible);
      const stateText = Array.from(latestResponse.querySelectorAll('*')).some((el) => {
        const text = normalize(el.textContent);
        return isVisible(el) && isLeaf(el) && text.length > 0 && text.length <= 80 && /^(thinking|generating|working|planning|running|responding)/i.test(text);
      });
      if (generatingButton || animated || stateText) {
        status = 'generating';
      }
    }

    const entries = [];
    const seen = new Set();
    const pushMessage = (role, content, el, kind, meta) => {
      const text = (content || '').trim();
      if (!text) return;
      const key = role + ':' + (kind || 'standard') + ':' + text.slice(0, 240);
      if (seen.has(key)) return;
      seen.add(key);
      entries.push({ role, content: text, el, kind: kind || 'standard', meta: meta || undefined });
    };

    const rows = Array.from(listRoot.querySelectorAll('.monaco-list-row.request, .monaco-list-row.response')).filter((row) => isVisible(row) && !row.closest('.chat-welcome-view-container'));

    rows.forEach((row) => {
      if (row.classList.contains('request')) {
        const contentNode = row.querySelector('.chat-markdown-part, .rendered-markdown, .value') || row;
        pushMessage('user', cleanMarkdown(contentNode) || normalize(row.getAttribute('aria-label') || row.textContent), row, 'standard');
        return;
      }

      const value = row.querySelector('.value') || row;
      const parts = Array.from(value.children || []).filter((child) => {
        if (!child) return false;
        if (/chat-mcp-servers-interaction|chat-footer-toolbar/.test((child.className || '').toString())) return false;
        return !!(normalize(child.textContent) || child.querySelector('pre, table, code, .rendered-markdown'));
      });

      if (!parts.length) {
        pushMessage('assistant', cleanMarkdown(value) || normalize(row.getAttribute('aria-label') || row.textContent), row, 'standard');
        return;
      }

      parts.forEach((part) => {
        const cls = (part.className || '').toString();
        let kind = 'standard';
        let meta;
        if (/think/i.test(cls)) {
          kind = 'thought';
        } else if (/terminal|command/i.test(cls) || part.querySelector('.chat-terminal-content-part, .chat-terminal-thinking-collapsible, .chat-terminal-command-block')) {
          kind = 'terminal';
          const text = normalize(part.textContent);
          meta = {
            label: normalize(part.querySelector('[class*="label"], .title')?.textContent || text.split('\n')[0] || 'Terminal'),
            isRunning: /running/i.test(text)
          };
        } else if (/tool/i.test(cls)) {
          kind = 'tool';
        }

        const content = cleanMarkdown(part) || normalize(part.getAttribute('aria-label') || part.textContent);
        pushMessage('assistant', content, part, kind, meta);
      });
    });

    entries.sort((a, b) => {
      if (!a.el || !b.el) return 0;
      const position = a.el.compareDocumentPosition(b.el);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    const messages = entries.map((entry, index) => ({
      role: entry.role,
      content: entry.content,
      index,
      kind: entry.kind,
      meta: entry.meta
    }));

    return JSON.stringify({
      id: document.querySelector('.agent-sessions-viewer .monaco-list-row.selected, .agent-sessions-viewer .monaco-list-row.focused')?.id || 'active',
      status,
      title: getTitle(),
      messages,
      inputContent: getInputContent(),
      activeModal
    });
  } catch (e) {
    return JSON.stringify({
      id: 'active',
      status: 'idle',
      title: 'Active Session',
      messages: [],
      inputContent: '',
      activeModal: null,
      error: e.message
    });
  }
})()
