(() => {
  try {
    const frame = document.getElementById('active-frame');
    const doc = frame?.contentDocument || frame?.contentWindow?.document || document;
    const view = doc.defaultView || window;
    const normalizeInline = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const normalizeBlock = (value) => String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
    const simpleHash = (value) => {
      const text = String(value || '');
      let hash = 0;
      for (let i = 0; i < text.length; i += 1) {
        hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
      }
      return Math.abs(hash).toString(36);
    };
    const buildTurnKey = (role, kind, orderKey, content) => `claude-code:${role}:${kind || 'standard'}:${orderKey}:${simpleHash(content)}`;
    const buildProviderSessionId = (messages) => {
      const stableTurnKeys = messages
        .map((message) => typeof message?._turnKey === 'string' ? message._turnKey.trim() : '')
        .filter(Boolean);
      if (stableTurnKeys.length > 0) {
        return `claude-code:${stableTurnKeys.slice(0, 4).join('|')}`;
      }
      return '';
    };

    const visible = (el) => {
      if (!el || el.closest('[inert]')) return false;
      const rect = el.getBoundingClientRect();
      const style = (el.ownerDocument?.defaultView || view).getComputedStyle(el);
      return rect.width > 8 && rect.height > 8 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const getControlCache = () => {
      if (!window.__adhdevClaudeCodeControls || typeof window.__adhdevClaudeCodeControls !== 'object') {
        window.__adhdevClaudeCodeControls = {};
      }
      return window.__adhdevClaudeCodeControls;
    };
    const sanitizeToolOutput = (value) => normalizeBlock(value).replace(/\n?\[rerun:\s*[^\]]+\]\s*$/i, '').trim();

    const title = normalizeInline(
      doc.querySelector('button.titleText_aqhumA, .titleText_aqhumA, .titleTextInner_aqhumA')?.textContent || ''
    ) || 'Untitled';

    const root = doc.getElementById('root') || doc.body;
    const isVisible = visible(root);
    const input = doc.querySelector('[role="textbox"].messageInput_cKsPxg');
    const inputContent = normalizeBlock(input?.innerText || input?.textContent || '');

    const messages = [];
    const seen = new Set();
    const pushMessage = (role, content, extras = {}) => {
      const text = normalizeBlock(content);
      if (!text) return;
      const key = `${role}:${extras.kind || 'standard'}:${text}`;
      if (seen.has(key)) return;
      seen.add(key);
      messages.push({ role, content: text, ...extras });
    };

    const messageRows = Array.from(doc.querySelectorAll('.messagesContainer_07S1Yg .message_07S1Yg'))
      .filter(visible)
      .filter((row) => !row.parentElement?.closest('.message_07S1Yg'));

    messageRows.forEach((row, index) => {
      const cls = normalizeInline(row.className || '');
      if (!cls.includes('message_07S1Yg')) return;

      const text = normalizeBlock(row.innerText || row.textContent || '');
      if (!text || text === title) return;

      let role = null;
      if (cls.includes('userMessageContainer_07S1Yg')) role = 'user';
      if (cls.includes('timelineMessage_07S1Yg')) role = 'assistant';
      if (!role) return;
      if (role === 'user' && /^Switched to\s+/i.test(text)) return;

      if (role === 'assistant') {
        const thinking = row.querySelector('details.thinking_aHyQPQ, details[class*="thinking"]');
        if (thinking) {
          const label = normalizeInline(thinking.querySelector('summary span')?.textContent || 'Thinking');
          const thoughtText = normalizeBlock(
            thinking.querySelector('.thinkingContent_aHyQPQ, [class*="thinkingContent"]')?.innerText
            || thinking.querySelector('.thinkingContent_aHyQPQ, [class*="thinkingContent"]')?.textContent
            || ''
          );
          pushMessage(
            'assistant',
            thoughtText || label,
            {
              kind: 'thought',
              meta: { label },
              _turnKey: buildTurnKey('assistant', 'thought', index, thoughtText || label),
            },
          );
          return;
        }

        const toolUse = row.querySelector('.toolUse_uq5aLg, [class*="toolUse"]');
        if (toolUse) {
          const toolLabel = normalizeInline(
            toolUse.querySelector('.toolNameText_ZUQaOA, [class*="toolNameText"]')?.textContent
            || toolUse.querySelector('summary')?.textContent
            || 'Tool'
          );
          const toolRows = Array.from(toolUse.querySelectorAll('.toolBodyRow_ZUQaOA, [class*="toolBodyRow"]'));
          const sections = toolRows.map((toolRow) => ({
            label: normalizeInline(toolRow.querySelector('.toolBodyRowLabel_ZUQaOA, [class*="toolBodyRowLabel"]')?.textContent || ''),
            content: sanitizeToolOutput(
              toolRow.querySelector('.toolBodyRowContent_ZUQaOA, [class*="toolBodyRowContent"]')?.innerText
              || toolRow.querySelector('.toolBodyRowContent_ZUQaOA, [class*="toolBodyRowContent"]')?.textContent
              || ''
            ),
          })).filter((section) => section.label || section.content);

          const outputSection = sections.find((section) => /^(out|output|result)$/i.test(section.label));
          const inputSection = sections.find((section) => /^(in|input)$/i.test(section.label))
            || sections.find((section) => section !== outputSection && section.content);
          const terminalLike = /^(bash|sh|zsh|terminal)$/i.test(toolLabel);

          if (terminalLike) {
            const chunks = [];
            if (inputSection?.content) chunks.push(`$ ${inputSection.content}`);
            if (outputSection?.content) chunks.push(outputSection.content);
            if (!chunks.length && text) chunks.push(sanitizeToolOutput(text));
            pushMessage(
              'assistant',
              chunks.join('\n\n'),
              {
                kind: 'terminal',
                meta: { label: toolLabel },
                _turnKey: buildTurnKey('assistant', 'terminal', index, chunks.join('\n\n')),
              },
            );
            return;
          }

          const toolSummary = [toolLabel, inputSection?.content || outputSection?.content || text]
            .filter(Boolean)
            .join('\n')
            .trim();
          pushMessage(
            'assistant',
            toolSummary,
            {
              kind: 'tool',
              meta: { label: toolLabel },
              _turnKey: buildTurnKey('assistant', 'tool', index, toolSummary),
            },
          );
          return;
        }
      }

      const isThoughtSummary = role === 'assistant' && /^Thought for\s+[\d.]+\s*(seconds?|s)$/i.test(text);
      pushMessage(
        role,
        text,
        {
          ...(isThoughtSummary ? { kind: 'thought', meta: { label: 'Thinking' } } : {}),
          _turnKey: buildTurnKey(role, isThoughtSummary ? 'thought' : 'standard', index, text),
        },
      );
    });

    const welcome = doc.querySelector('.message_AV_aEg, .messageContainer_AV_aEg, [class*="emptyState" i] [class*="message" i]');
    const welcomeText = welcome && visible(welcome)
      ? normalizeBlock(welcome.innerText || welcome.textContent || '')
      : '';
    const isWelcomeScreen = messages.length === 0 && !!welcomeText;

    const spinner = doc.querySelector('.messagesContainer_07S1Yg > .spinnerRow_07S1Yg');
    const spinnerText = spinner && visible(spinner) ? normalizeBlock(spinner.innerText || spinner.textContent || '') : '';
    const modeButton = doc.querySelector('button[aria-label^="Select conversation mode"]')
      || doc.querySelector('button.footerButton_gGYT1w.footerButtonPrimary_gGYT1w');
    const mode = normalizeInline(
      modeButton?.textContent
      || modeButton?.getAttribute?.('aria-label')?.replace(/^Select conversation mode, current:\s*/i, '')
      || ''
    );
    if (mode) getControlCache().mode = mode;
    const modelButton = doc.querySelector('button[aria-label^="Select model"]');
    const liveModel = normalizeInline(
      modelButton?.textContent
      || modelButton?.getAttribute?.('aria-label')?.replace(/^Select model, current:\s*/i, '')
      || ''
    );
    if (liveModel) {
      getControlCache().model = liveModel;
      getControlCache().modelLabel = liveModel;
    }
    const cachedThinking = getControlCache().thinking;
    const effortLabel = normalizeInline(
      doc.querySelector('.effortLabel_8RAulQ, [class*="effortLabel"]')?.textContent
      || getControlCache().effort
      || ''
    );
    const effort = (() => {
      const match = effortLabel.match(/(low|medium|high|max)/i);
      return match ? match[1].toLowerCase() : '';
    })();
    const model = liveModel || normalizeInline(getControlCache().modelLabel || getControlCache().model || '');

    const footerStopButton = Array.from(doc.querySelectorAll('button.footerButton_gGYT1w, button[class*="footerButton"]'))
      .filter(visible)
      .find((b) => /^(stop|cancel|interrupt)$/i.test(normalizeInline(b.textContent || b.getAttribute('aria-label') || '')));
    const providerSessionId = buildProviderSessionId(messages);
    const approvalPositive = /^(yes|allow|approve|accept|continue|run|always|once|proceed|confirm|submit|save|resume)/i;
    const approvalNegative = /^(no|deny|reject|cancel|dismiss|skip|abort)/i;
    const normalizeApprovalLabel = (label) => label.replace(/^\d+(?:[.)]|\s)+/, '').trim();
    const collectApprovalButtons = () => {
      const labels = [];
      const seenLabels = new Set();
      const searchDocs = Array.from(new Set([doc, document].filter(Boolean)));
      for (const searchDoc of searchDocs) {
        const nodes = Array.from(searchDoc.querySelectorAll('button, [role="button"], [role="option"], [role="radio"]'));
        for (const node of nodes) {
          if (!visible(node) || node.disabled) continue;
          const label = normalizeInline(node.textContent || node.getAttribute('aria-label') || node.getAttribute('title') || '');
          const normalizedLabel = normalizeApprovalLabel(label);
          if (!label || label.length > 120) continue;
          if (!approvalPositive.test(normalizedLabel) && !approvalNegative.test(normalizedLabel)) continue;
          const key = label.toLowerCase();
          if (seenLabels.has(key)) continue;
          seenLabels.add(key);
          labels.push(label);
        }
      }
      return labels;
    };

    let status = 'idle';
    if (spinner && visible(spinner)) status = 'generating';
    if (footerStopButton) status = 'generating';

    // Detect approval prompts from either numbered assistant text OR visible approval-style
    // buttons/options in the current webview. Claude Code sometimes renders real action
    // buttons instead of the older numbered text-only prompt, so relying on the last
    // assistant message alone misses live approvals.
    const lastAssistant = messages.filter((m) => m.role === 'assistant').slice(-1)[0];
    const numberedOptions = [];
    if (lastAssistant && status === 'idle') {
      const optLines = lastAssistant.content.split('\n').filter((l) => /^\s*\d+[.\s)]\s*\S/.test(l));
      if (optLines.length >= 2 && optLines.length <= 6) {
        const parsed = [];
        for (const l of optLines) {
          const m = l.match(/^\s*(\d+)[.\s)]\s*(.+)/);
          if (m) parsed.push(`${m[1]} ${m[2].trim()}`);
        }
        const looksLikeApproval = parsed.every((opt) => opt.length <= 70)
          && parsed.some((opt) => approvalPositive.test(opt.replace(/^\d+\s+/, '')) || approvalNegative.test(opt.replace(/^\d+\s+/, '')));
        if (looksLikeApproval) {
          numberedOptions.push(...parsed);
        }
      }
    }

    const approvalButtons = collectApprovalButtons();

    let activeModal = null;
    const combinedApprovalButtons = Array.from(new Set([...numberedOptions, ...approvalButtons]));
    if (combinedApprovalButtons.length >= 2) {
      status = 'waiting_approval';
      activeModal = {
        message: lastAssistant?.content || 'Claude Code requires approval',
        buttons: combinedApprovalButtons,
      };
    }

    if (!isVisible && messages.length === 0) status = 'panel_hidden';

    return JSON.stringify({
      id: title,
      ...(providerSessionId ? { providerSessionId } : {}),
      title,
      agentType: 'claude-code-vscode',
      agentName: 'Claude Code',
      extensionId: 'anthropic.claude-code',
      status,
      ...(model ? { model } : {}),
      ...(mode ? { mode } : {}),
      ...(effort ? { effort } : {}),
      ...(typeof cachedThinking === 'boolean' ? { thinking: cachedThinking } : {}),
      isVisible,
      isWelcomeScreen,
      messages: messages.slice(-40),
      inputContent,
      activeModal,
      controlValues: {
        ...(model ? { model } : {}),
        ...(mode ? { mode } : {}),
        ...(effort ? { effort } : {}),
        ...(typeof cachedThinking === 'boolean' ? { thinking: cachedThinking } : {}),
      },
      generation: status === 'generating'
        ? {
            spinnerText: spinnerText || null,
          }
        : null,
    });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e), status: 'error', messages: [] });
  }
})();
