'use strict';

const detectStatus = require('./detect_status.js');
const parseApproval = require('./parse_approval.js');
const {
  cleanAnsi,
  extractCurrentModel,
  extractProviderSessionId,
} = require('./helpers.js');

function normalize(line) {
  return cleanAnsi(line)
    .replace(/\s+/g, ' ')
    .trim();
}

function isNoise(line) {
  return !line
    || /^[─═╭╮╰╯│┌┐└┘├┤┬┴┼]+$/.test(line)
    || /^\d+$/.test(line)
    || /Hermes Agent v[0-9]/i.test(line)
    || /Available Tools|Available Skills/i.test(line)
    || /gpt-5\.4|ctx --|\d+(?:\.\d+)?K\/\d+(?:\.\d+)?M|\[\S+\]\s*\d+%/i.test(line)
    || /Type your message or \/help for commands/i.test(line)
    || /Tip: hermes sessions prune/i.test(line)
    || /Enter to interrupt, Ctrl\+C to cancel/i.test(line)
    || /Initializing agent/i.test(line)
    || /(?:^|\s)(?:\([^\n]{0,24}\)\s*)?(?:♡\s*)?reasoning(?:\.\.\.|…)/i.test(line)
    || /commits behind/i.test(line)
    || /^❯\s*$/.test(line)
    || /^Session:\s+\d{8}_\d{6}_/i.test(line)
    || /^Project:\s+/i.test(line)
    || /^Resume this session with:/i.test(line);
}

function extractHistoryState(text) {
  const source = cleanAnsi(text);
  if (!source.trim()) return {};

  const newSessionMatch = source.match(/New session started!/i);
  if (newSessionMatch) {
    return {
      historyMessageCount: 0,
      sessionEvent: 'new_session',
    };
  }

  const remainingMatch = source.match(/(\d+)\s+message\(s\)\s+remaining in history\./i);
  const undoMatch = source.match(/Undid\s+(\d+)\s+message\(s\)\./i);
  if (remainingMatch || undoMatch) {
    return {
      historyMessageCount: remainingMatch ? Number.parseInt(remainingMatch[1], 10) : undefined,
      sessionEvent: 'undo',
    };
  }

  return {};
}

function normalizeMessage(message) {
  return {
    role: message?.role === 'user' ? 'user' : 'assistant',
    kind: typeof message?.kind === 'string' && message.kind ? message.kind : 'standard',
    senderName: typeof message?.senderName === 'string' && message.senderName ? message.senderName : undefined,
    content: String(message?.content || '').trim(),
  };
}

function isLikelyTruncatedDuplicate(longer, shorter, options = {}) {
  if (!longer || !shorter) return false;
  if (longer.length <= shorter.length) return false;
  const minLength = typeof options.minLength === 'number' ? options.minLength : 48;
  if (shorter.length < minLength) return false;
  return longer.startsWith(shorter) || longer.includes(shorter);
}

function messagesMatch(left, right) {
  const a = normalizeMessage(left);
  const b = normalizeMessage(right);
  if (!a.content || !b.content || a.role !== b.role || a.kind !== b.kind) return false;
  const duplicateMinLength = a.role === 'assistant' && a.kind === 'standard' ? 8 : 48;
  return a.content === b.content
    || isLikelyTruncatedDuplicate(a.content, b.content, { minLength: duplicateMinLength })
    || isLikelyTruncatedDuplicate(b.content, a.content, { minLength: duplicateMinLength });
}

function chooseMoreCompleteMessage(left, right) {
  const a = normalizeMessage(left);
  const b = normalizeMessage(right);
  const preferred = b.content.length > a.content.length ? b : a;
  const fallback = preferred === a ? b : a;
  return {
    role: preferred.role,
    kind: preferred.kind || fallback.kind,
    senderName: preferred.senderName || fallback.senderName,
    content: preferred.content,
  };
}

function parseActivityMessage(line) {
  // Match any emoji/symbol after the activity-line prefix (┊ or │).
  // Captures the first token (emoji or $) so we can classify terminal vs tool.
  const match = line.match(/^[┊│]\s*(\p{Emoji}\uFE0F?|\$)\s+(.+)$/u);
  if (!match) return null;
  const icon = match[1];
  const body = match[2]
    .replace(/\s+\d+(?:\.\d+)?s$/u, '')
    .replace(/\s*[│┊]\s*$/u, '')
    .trim();
  if (!body || isNoise(body)) return null;
  if (icon === '💻' || icon === '$' || body.startsWith('$')) {
    return { role: 'assistant', kind: 'terminal', senderName: 'Terminal', content: body };
  }
  if (icon === '📋') {
    return { role: 'assistant', kind: 'tool', senderName: 'Plan', content: body };
  }
  return { role: 'assistant', kind: 'tool', senderName: 'Tool', content: body };
}

function createApprovalMessage(activeModal) {
  const message = String(activeModal?.message || '').trim();
  const buttons = Array.isArray(activeModal?.buttons)
    ? activeModal.buttons.map((button) => String(button || '').trim()).filter(Boolean)
    : [];
  const lines = ['Approval requested'];
  if (message) lines.push(message);
  if (buttons.length > 0) lines.push(buttons.map((label) => `[${label}]`).join(' '));
  return {
    role: 'assistant',
    kind: 'system',
    senderName: 'System',
    content: lines.join('\n'),
  };
}

function dedupeMessages(messages) {
  const next = [];
  for (const rawMessage of messages) {
    const message = normalizeMessage(rawMessage);
    if (!message.content) continue;
    const prev = next[next.length - 1];
    if (prev && messagesMatch(prev, message)) {
      next[next.length - 1] = chooseMoreCompleteMessage(prev, message);
      continue;
    }
    next.push(message);
  }
  return next.map((message, index) => ({
    id: `msg_${index}`,
    role: message.role,
    content: message.content,
    index,
    kind: message.kind || 'standard',
    ...(message.senderName ? { senderName: message.senderName } : {}),
  }));
}

function mergeMessageHistories(baseMessages, currentMessages) {
  const merged = (Array.isArray(baseMessages) ? baseMessages : []).map(normalizeMessage).filter((message) => message.content);
  const current = (Array.isArray(currentMessages) ? currentMessages : []).map(normalizeMessage).filter((message) => message.content);
  if (merged.length === 0) return dedupeMessages(current);
  if (current.length === 0) return dedupeMessages(merged);

  let cursor = 0;
  for (const message of current) {
    let matchIndex = -1;
    for (let i = cursor; i < merged.length; i += 1) {
      if (messagesMatch(merged[i], message)) {
        matchIndex = i;
        break;
      }
    }

    if (matchIndex >= 0) {
      merged[matchIndex] = chooseMoreCompleteMessage(merged[matchIndex], message);
      cursor = matchIndex + 1;
      continue;
    }

    merged.push(message);
    cursor = merged.length;
  }

  return dedupeMessages(merged);
}

function parseMessages(text) {
  const lines = cleanAnsi(text).split(/\r?\n/);
  const messages = [];
  let inAssistantBox = false;
  let assistantLines = [];
  let inUserMessage = false;
  let userLines = [];

  const flushAssistant = () => {
    const content = assistantLines
      .map(normalize)
      .filter((line) => !isNoise(line))
      .join('\n')
      .trim();
    if (content) {
      messages.push({ role: 'assistant', content });
    }
    assistantLines = [];
  };

  const flushUser = () => {
    const content = userLines
      .map(normalize)
      .filter((line) => line && !isNoise(line))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (content) {
      messages.push({ role: 'user', content });
    }
    userLines = [];
    inUserMessage = false;
  };

  const isPromptLine = (line) => /^(?:⚕\s*)?❯\s*(?:$|\S.*)$/.test(line);

  for (const rawLine of lines) {
    const line = normalize(rawLine);
    if (!line) {
      if (inAssistantBox) assistantLines.push(line);
      continue;
    }

    if (/^●\s+/.test(line)) {
      if (inAssistantBox) {
        flushAssistant();
        inAssistantBox = false;
      }
      if (inUserMessage) flushUser();
      const content = line.replace(/^●\s+/, '').trim();
      if (content) {
        inUserMessage = true;
        userLines = [content];
      }
      continue;
    }

    if (/^╭─\s*⚕\s*Hermes/i.test(line)) {
      if (inUserMessage) flushUser();
      if (inAssistantBox) flushAssistant();
      inAssistantBox = true;
      assistantLines = [];
      continue;
    }

    if (/^╰─/.test(line)) {
      if (inAssistantBox) {
        flushAssistant();
        inAssistantBox = false;
      }
      continue;
    }

    const activityMessage = parseActivityMessage(line);
    if (activityMessage) {
      if (inUserMessage) flushUser();
      if (inAssistantBox) {
        flushAssistant();
        inAssistantBox = false;
      }
      messages.push(activityMessage);
      continue;
    }

    if (inUserMessage) {
      if (isPromptLine(line) || isNoise(line)) {
        flushUser();
        if (isPromptLine(line)) continue;
      } else {
        userLines.push(line);
        continue;
      }
    }

    if (inAssistantBox) {
      assistantLines.push(line);
    }
  }

  if (inUserMessage) flushUser();
  if (inAssistantBox) flushAssistant();

  return dedupeMessages(messages);
}

module.exports = function parseOutput(input) {
  const transcript = String(input?.buffer || input?.screenText || input?.rawBuffer || '');
  const screenText = String(input?.screenText || '');
  const status = detectStatus({
    screenText,
    tail: input?.recentBuffer || input?.tail || '',
    buffer: transcript,
    isWaitingForResponse: input?.isWaitingForResponse,
  });

  const parsedApproval = parseApproval({
    screenText,
    buffer: transcript,
    tail: input?.recentBuffer || input?.tail || '',
  });

  const baseMessages = Array.isArray(input?.messages)
    ? input.messages
        .filter((message) => message && (message.role === 'user' || message.role === 'assistant'))
        .map((message) => ({
          role: message.role,
          kind: message.kind,
          senderName: message.senderName,
          content: String(message.content || ''),
        }))
    : [];
  const transcriptMessages = parseMessages(transcript || '')
    .map((message) => ({
      role: message.role,
      kind: message.kind,
      senderName: message.senderName,
      content: String(message.content || ''),
    }));
  const screenMessages = parseMessages(screenText || '')
    .map((message) => ({
      role: message.role,
      kind: message.kind,
      senderName: message.senderName,
      content: String(message.content || ''),
    }));
  const currentMessages = screenMessages.length > 0 ? screenMessages : transcriptMessages;
  const messages = mergeMessageHistories(baseMessages, currentMessages);
  const activeModal = parsedApproval || null;
  const effectiveStatus = activeModal ? 'waiting_approval' : status;
  const finalMessages = activeModal
    ? dedupeMessages([...messages, createApprovalMessage(activeModal)])
    : messages;
  const model = extractCurrentModel(screenText || transcript);
  const providerSessionId = extractProviderSessionId(transcript || screenText);
  const historyState = extractHistoryState(transcript || screenText);

  return {
    id: 'cli_session',
    title: 'Hermes Agent',
    status,
    model,
    messages: finalMessages,
    activeModal,
    providerSessionId,
    ...historyState,
  };
};
