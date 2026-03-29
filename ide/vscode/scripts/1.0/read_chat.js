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
      return normalize(
        selected?.querySelector('.monaco-highlighted-label, .label-name, .title, .monaco-icon-label')?.textContent ||
          selected?.getAttribute('aria-label') ||
          document.querySelector('.monaco-alert')?.textContent ||
          'Active Session'
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
      clone.querySelectorAll('button, .monaco-toolbar, .chat-codeblock-toolbar, script, style, svg.codicon[aria-hidden="true"]').forEach((el) => el.remove());
      return htmlToMarkdown(clone)
        .replace(/\n\s*\n\s*\n+/g, '\n\n')
        .replace(/[ \t]+\n/g, '\n')
        .trim();
    };

    const buttonLabels = Array.from(root.querySelectorAll('button, [role="button"], .monaco-button, a[role="button"]'))
      .filter(isVisible)
      .map((el) => normalize(el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent))
      .filter((label) => label && label.length <= 80);
    const approvalActions = buttonLabels.filter((label) => /(run|skip|accept|reject|approve|deny|allow|block|continue|retry|cancel)/i.test(label) && label.length <= 40);

    let status = 'idle';
    let activeModal = null;
    if (approvalActions.length) {
      status = 'waiting_approval';
      activeModal = { actions: approvalActions };
    } else {
      const generatingButton = Array.from(root.querySelectorAll('a[role="button"], button, [role="button"]')).find((el) => {
        if (!isVisible(el)) return false;
        const label = normalize(el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent).toLowerCase();
        return /stop|cancel|interrupt|pause generation|stop generating/.test(label);
      });
      const animated = Array.from(root.querySelectorAll('.monaco-progress-container.active, .codicon-loading, .codicon-sync.codicon-modifier-spin')).some(isVisible);
      const stateText = Array.from(root.querySelectorAll('*')).some((el) => {
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

    Array.from(listRoot.querySelectorAll('[class*="request"], [data-kind*="request"], .chat-request')).forEach((el) => {
      if (!isVisible(el) || el.closest('.chat-welcome-view-container')) return;
      pushMessage('user', cleanMarkdown(el), el, 'standard');
    });

    Array.from(listRoot.querySelectorAll('.rendered-markdown, .chat-markdownContentPart, [class*="markdown"]')).forEach((el) => {
      if (!isVisible(el) || el.closest('.chat-welcome-view-container')) return;
      const container = el.closest('[class*="response"], [data-kind*="response"], .chat-response, .chat-toolInvocationPart, .chat-thinking-part') || el;
      const cls = (container.className || '').toString();
      let kind = 'standard';
      let meta;
      if (/think/i.test(cls)) kind = 'thought';
      if (/tool/i.test(cls)) kind = 'tool';
      if (/terminal|command/i.test(cls)) {
        kind = 'terminal';
        meta = { label: normalize(container.querySelector('[class*="label"], .title')?.textContent || 'Terminal') };
      }
      pushMessage('assistant', cleanMarkdown(el), container, kind, meta);
    });

    Array.from(listRoot.querySelectorAll('pre')).forEach((el) => {
      if (!isVisible(el) || el.closest('.chat-welcome-view-container')) return;
      const container = el.closest('[class*="response"], [data-kind*="response"], .chat-response, .chat-toolInvocationPart') || el;
      const kind = /tool/i.test((container.className || '').toString()) ? 'tool' : 'standard';
      pushMessage('assistant', cleanMarkdown(el), container, kind);
    });

    Array.from(listRoot.querySelectorAll('[class*="tool"], [class*="terminal"], [class*="command"]')).forEach((el) => {
      if (!isVisible(el) || el.closest('.chat-welcome-view-container')) return;
      const text = normalize(el.textContent);
      if (!text || text.length < 3 || text.length > 500) return;
      if (!/tool|command|terminal|running|ran|edit|search|read|create/i.test(text)) return;
      const isTerminal = /terminal|command|running|ran/i.test(text);
      pushMessage('assistant', text, el, isTerminal ? 'terminal' : 'tool', isTerminal ? { label: text.split('\n')[0], isRunning: /running/i.test(text) } : undefined);
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
