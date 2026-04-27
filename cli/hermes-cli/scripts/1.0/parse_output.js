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

const CODE_FENCE_LABELS = new Set([
  'bash', 'console', 'diff', 'javascript', 'js', 'json', 'markdown', 'md', 'python', 'shell', 'sh', 'sql', 'text', 'ts', 'tsx', 'typescript', 'yaml', 'yml',
]);

function looksLikeFenceBodyStart(label, nextLine) {
  const line = String(nextLine || '').trim();
  if (!line || /^```/.test(line)) return false;
  switch (label) {
    case 'python':
      return /^(?:from\s+|import\s+|def\s+|class\s+|print\(|if\s+|for\s+|while\s+|with\s+|try:|except\b|return\b|[A-Za-z_][A-Za-z0-9_]*\s*=)/.test(line);
    case 'bash':
    case 'shell':
    case 'sh':
      return /^(?:\$\s+|[#~./A-Za-z_][^\n]*)$/.test(line);
    case 'json':
      return /^[\[{]/.test(line);
    case 'text':
      return /^(?:[A-Z][A-Z0-9_]*=|\$\s+|[~/]|JSON=|CWD=|\{|\[)/.test(line);
    default:
      return /^(?:[A-Za-z_][A-Za-z0-9_]*\s*=|from\s+|import\s+|\{|\[|\$\s+)/.test(line);
  }
}

function restoreAssistantCodeFences(text) {
  const source = String(text || '').trim();
  if (!source || /```/.test(source)) return source;

  const lines = source.split(/\r?\n/);
  const restored = [];
  let openFence = null;
  let changed = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = String(lines[index] || '');
    const trimmed = line.trim();
    const label = trimmed.toLowerCase();
    const nextLine = index + 1 < lines.length ? lines[index + 1] : '';
    const startsFence = CODE_FENCE_LABELS.has(label) && looksLikeFenceBodyStart(label, nextLine);

    if (startsFence) {
      if (openFence) restored.push('```');
      restored.push(`\`\`\`${label}`);
      openFence = label;
      changed = true;
      continue;
    }

    restored.push(line);
  }

  if (openFence) restored.push('```');
  return changed ? restored.join('\n').trim() : source;
}

const TRANSIENT_STATUS_WORDS = [
  'analyzing',
  'ruminating',
  'reasoning',
  'thinking',
  'processing',
  'working',
  'contemplating',
];

const TRANSIENT_STATUS_PATTERN = TRANSIENT_STATUS_WORDS.join('|');

function stripTransientPromptSuffix(text) {
  const source = String(text || '').trim();
  if (!source) return '';

  const lower = source.toLowerCase();
  const transientMarkers = TRANSIENT_STATUS_WORDS.map((word) => `${word}...`);

  let cutIndex = -1;
  for (const marker of transientMarkers) {
    const idx = lower.lastIndexOf(marker);
    if (idx > cutIndex) cutIndex = idx;
  }
  if (cutIndex < 0) return source;

  const preludeMarkers = [
    'window too small...',
  ];
  for (const marker of preludeMarkers) {
    const idx = lower.lastIndexOf(marker, cutIndex);
    if (idx >= 0) {
      cutIndex = idx;
      break;
    }
  }

  const stripped = source.slice(0, cutIndex).trim();
  const tokens = stripped.split(/\s+/).filter(Boolean);
  while (tokens.length > 0 && !/[A-Za-z0-9\u00C0-\u024F\u0400-\u04FF\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/u.test(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens.join(' ').trim();
}

function stripActivityTransientSuffix(text) {
  let source = String(text || '').trim();
  if (!source) return '';

  source = source
    .replace(new RegExp(`\\s*\\([^\\n()]{1,32}\\)\\s*(?:${TRANSIENT_STATUS_PATTERN})(?:\\.\\.\\.|…)?\\s*$`, 'iu'), '')
    .replace(new RegExp(`\\s+\\d+(?:\\.\\d+)?s\\s*(?:${TRANSIENT_STATUS_PATTERN})(?:\\.\\.\\.|…)?\\s*$`, 'iu'), '')
    .replace(/\s+\d+(?:\.\d+)?s\s*$/u, '')
    .replace(/\s*[│┊]\s*$/u, '')
    .trim();

  return source;
}

function normalizeMessage(message) {
  const role = message?.role === 'user' ? 'user' : 'assistant';
  const kind = typeof message?.kind === 'string' && message.kind ? message.kind : 'standard';
  const rawContent = String(message?.content || '').trim();
  const normalizedContent = role === 'user'
    ? stripTransientPromptSuffix(rawContent)
    : (role === 'assistant' && (kind === 'tool' || kind === 'terminal')
        ? stripActivityTransientSuffix(rawContent)
        : rawContent);
  return {
    role,
    kind,
    senderName: typeof message?.senderName === 'string' && message.senderName ? message.senderName : undefined,
    content: role === 'assistant' && kind === 'standard'
      ? restoreAssistantCodeFences(normalizedContent)
      : normalizedContent,
  };
}

function isLikelyTruncatedDuplicate(longer, shorter, options = {}) {
  if (!longer || !shorter) return false;
  if (longer.length <= shorter.length) return false;
  const minLength = typeof options.minLength === 'number' ? options.minLength : 48;
  if (shorter.length < minLength) return false;
  return longer.startsWith(shorter) || longer.includes(shorter);
}

function getComparableContent(message) {
  const normalized = normalizeMessage(message);
  const rawContent = String(normalized.content || '').trim();
  if (!rawContent) return '';

  if (normalized.role === 'assistant' && normalized.kind === 'standard') {
    const contentLines = rawContent
      .split(/\r?\n/)
      .map(normalize)
      .filter(Boolean);
    const prose = shouldReflowAssistantLines(contentLines)
      ? joinWrappedAssistantLines(contentLines)
      : contentLines.join('\n');
    return prose.replace(/\s+/g, ' ').trim();
  }

  return rawContent.replace(/\s+/g, ' ').trim();
}

function getCompactComparableContent(message) {
  return getComparableContent(message).replace(/\s+/g, '');
}

function comparableContentsMatch(left, right, minLength) {
  return left === right
    || isLikelyTruncatedDuplicate(left, right, { minLength })
    || isLikelyTruncatedDuplicate(right, left, { minLength });
}

function messagesMatch(left, right) {
  const a = normalizeMessage(left);
  const b = normalizeMessage(right);
  if (!a.content || !b.content || a.role !== b.role || a.kind !== b.kind) return false;
  const duplicateMinLength = a.role === 'assistant' && a.kind === 'standard' ? 8 : 48;
  const aComparable = getComparableContent(a);
  const bComparable = getComparableContent(b);
  if (comparableContentsMatch(aComparable, bComparable, duplicateMinLength)) return true;
  const aCompactComparable = getCompactComparableContent(a);
  const bCompactComparable = getCompactComparableContent(b);
  return comparableContentsMatch(aCompactComparable, bCompactComparable, duplicateMinLength);
}

function chooseMoreCompleteMessage(left, right) {
  const a = normalizeMessage(left);
  const b = normalizeMessage(right);
  const aComparable = getComparableContent(a);
  const bComparable = getComparableContent(b);
  const aCompactComparable = getCompactComparableContent(a);
  const bCompactComparable = getCompactComparableContent(b);

  if ((aComparable && aComparable === bComparable) || (aCompactComparable && aCompactComparable === bCompactComparable)) {
    const aNewlines = (a.content.match(/\n/g) || []).length;
    const bNewlines = (b.content.match(/\n/g) || []).length;
    const preferred = bNewlines < aNewlines ? b : a;
    const fallback = preferred === a ? b : a;
    return {
      role: preferred.role,
      kind: preferred.kind || fallback.kind,
      senderName: preferred.senderName || fallback.senderName,
      content: preferred.content,
    };
  }

  const preferred = bComparable.length > aComparable.length ? b : a;
  const fallback = preferred === a ? b : a;
  return {
    role: preferred.role,
    kind: preferred.kind || fallback.kind,
    senderName: preferred.senderName || fallback.senderName,
    content: preferred.content,
  };
}

const COMMON_WRAP_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'their', 'then', 'this', 'to', 'was', 'with',
]);

function shouldReflowAssistantLines(lines) {
  return Array.isArray(lines)
    && lines.length > 1
    && lines.slice(0, -1).every((line) => String(line || '').trim().length >= 48)
    && !lines.some((line) => /^```/.test(line))
    && !lines.some((line) => /^\|/.test(line))
    && !lines.some((line) => /^\s*(?:[-*+] |\d+\.\s)/.test(line));
}

function normalizeReflowedAssistantText(text) {
  return String(text || '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/(\d)\s+,/g, '$1,');
}

function joinWrappedAssistantLines(lines) {
  const joined = lines.reduce((acc, line) => {
    const next = String(line || '').trim();
    if (!next) return acc;
    if (!acc) return next;

    if (/[,\d]$/.test(acc) && /^\d/.test(next)) {
      return `${acc}${next}`;
    }

    if (/[A-Za-z]$/.test(acc) && /^\d/.test(next)) {
      return `${acc}${next}`;
    }

    const fragmentMatch = acc.match(/([A-Za-z]{1,4})$/);
    const fragment = fragmentMatch ? fragmentMatch[1].toLowerCase() : '';
    if (/^[a-z]/.test(next) && fragment && !COMMON_WRAP_WORDS.has(fragment)) {
      return `${acc}${next}`;
    }

    return `${acc} ${next}`;
  }, '');

  return normalizeReflowedAssistantText(joined);
}

function looksLikeApprovalActivity(body) {
  const text = String(body || '').trim();
  if (!text) return false;
  return /^(?:Dangerous Command|requires approval|Approve delete|Do not delete|Other \(type your answer\)|Allow once|Allow for this session|Add to permanent allowlist|Deny|Show full command)$/i.test(text)
    || /script execution via -e\/-c flag/i.test(text);
}

function parseActivityHead(line) {
  // Match any emoji/symbol after the activity-line prefix (┊ or │).
  // Captures the first token (emoji or $) so we can classify terminal vs tool.
  const source = String(line || '').trimStart();
  const match = source.match(/^[┊│]\s*(\p{Emoji}\uFE0F?|\$)\s+(.+)$/u);
  if (!match) return null;
  return { icon: match[1], body: match[2] };
}

function joinActivityParts(parts) {
  return parts.reduce((acc, rawPart) => {
    const part = String(rawPart || '').replace(/\s+/g, ' ');
    if (!part.trim()) return acc;
    if (!acc) return part.trimStart();
    const accEndsWithSpace = /\s$/.test(acc);
    const partStartsWithSpace = /^\s/.test(part);
    if (accEndsWithSpace || partStartsWithSpace) {
      return `${acc.replace(/\s+$/u, ' ')}${part.trimStart()}`;
    }
    return `${acc}${part.trimStart()}`;
  }, '');
}

function normalizeActivityBody(parts) {
  return stripActivityTransientSuffix(joinActivityParts(parts));
}

function parseActivityMessage(line, continuationLines = []) {
  const head = parseActivityHead(line);
  if (!head) return null;
  const icon = head.icon;
  const body = normalizeActivityBody([head.body, ...continuationLines]);
  if (!body || isNoise(body) || looksLikeApprovalActivity(body)) return null;
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

function isStableAssistantAnswer(message) {
  const normalized = normalizeMessage(message);
  return normalized.role === 'assistant'
    && normalized.kind === 'standard'
    && String(normalized.content || '').length >= 80;
}

function isAssistantReplayAfterStableAssistant(merged, cursor, message) {
  const normalized = normalizeMessage(message);
  if (normalized.role !== 'assistant') return false;
  if (!Array.isArray(merged) || cursor <= 0) return false;

  // Hermes' terminal viewport can replay older activity rows after a completed
  // assistant answer when the scrollback reflows. Once a substantial standard
  // assistant answer is already the latest matched message, any further
  // assistant-only rows before the next user turn are stale viewport replay,
  // not a new user-visible turn. Real repeated commands after a new user turn
  // are still preserved because the previous merged row is then the user
  // message, not the stable assistant.
  return isStableAssistantAnswer(merged[cursor - 1]);
}

function collapseReplayedAssistantHistory(messages) {
  const source = dedupeMessages(Array.isArray(messages) ? messages : [])
    .map(normalizeMessage)
    .filter((message) => message.content);
  const collapsed = [];
  let afterStableAssistant = false;

  for (const message of source) {
    const normalized = normalizeMessage(message);
    if (normalized.role === 'user') {
      collapsed.push(normalized);
      afterStableAssistant = false;
      continue;
    }

    if (afterStableAssistant && normalized.role === 'assistant') {
      continue;
    }

    collapsed.push(normalized);
    afterStableAssistant = isStableAssistantAnswer(normalized);
  }

  return dedupeMessages(collapsed);
}

function mergeMessageHistories(baseMessages, currentMessages) {
  const merged = dedupeMessages(Array.isArray(baseMessages) ? baseMessages : [])
    .map(normalizeMessage)
    .filter((message) => message.content);
  const current = dedupeMessages(Array.isArray(currentMessages) ? currentMessages : [])
    .map(normalizeMessage)
    .filter((message) => message.content);
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

    if (isAssistantReplayAfterStableAssistant(merged, cursor, message)) {
      continue;
    }

    merged.push(message);
    cursor = merged.length;
  }

  return dedupeMessages(merged);
}

function trimMessagesForHistoryState(messages, historyState) {
  const normalized = (Array.isArray(messages) ? messages : [])
    .map(normalizeMessage)
    .filter((message) => message.content);

  const historyMessageCount = Number.isFinite(historyState?.historyMessageCount)
    ? Math.max(0, Number(historyState.historyMessageCount))
    : null;

  if (historyState?.sessionEvent === 'new_session' || historyMessageCount === 0) {
    return [];
  }

  if (historyState?.sessionEvent === 'undo' && historyMessageCount !== null) {
    return normalized.slice(0, historyMessageCount);
  }

  return normalized;
}

function hasMessageOverlap(baseMessages, currentMessages) {
  const base = (Array.isArray(baseMessages) ? baseMessages : []).map(normalizeMessage).filter((message) => message.content);
  const current = (Array.isArray(currentMessages) ? currentMessages : []).map(normalizeMessage).filter((message) => message.content);
  if (base.length === 0 || current.length === 0) return false;
  return current.some((message) => base.some((candidate) => messagesMatch(candidate, message)));
}

function mergeCoveredTranscript(baseMessages, rawMessages) {
  const base = dedupeMessages(Array.isArray(baseMessages) ? baseMessages : [])
    .map(normalizeMessage)
    .filter((message) => message.content);
  const raw = dedupeMessages(Array.isArray(rawMessages) ? rawMessages : [])
    .map(normalizeMessage)
    .filter((message) => message.content);
  if (base.length <= raw.length || raw.length < 2) return null;

  const matchedIndices = [];
  let cursor = 0;
  for (const message of raw) {
    let matchIndex = -1;
    for (let i = cursor; i < base.length; i += 1) {
      if (messagesMatch(base[i], message)) {
        matchIndex = i;
        break;
      }
    }
    if (matchIndex < 0) return null;
    matchedIndices.push(matchIndex);
    cursor = matchIndex + 1;
  }

  const firstMatch = matchedIndices[0];
  const lastMatch = matchedIndices[matchedIndices.length - 1];
  const hasInterleavedBaseNoise = matchedIndices.some((matchIndex, index) => index > 0 && matchIndex - matchedIndices[index - 1] > 1);
  if (!(firstMatch === 0 && lastMatch === base.length - 1 && hasInterleavedBaseNoise)) return null;

  return dedupeMessages(raw.map((message, index) => chooseMoreCompleteMessage(base[matchedIndices[index]], message)));
}

function shouldPreferRawMessages({
  baseMessages,
  rawMessages,
  transcriptMessages,
  screenMessages,
}) {
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) return false;
  if (!hasMessageOverlap(baseMessages, rawMessages)) {
    const transcriptCount = Array.isArray(transcriptMessages) ? transcriptMessages.length : 0;
    const screenCount = Array.isArray(screenMessages) ? screenMessages.length : 0;
    return transcriptCount > screenCount || rawMessages.length >= 4;
  }
  return Boolean(mergeCoveredTranscript(baseMessages, rawMessages));
}

function parseStructuralInputPromptLine(lines, index) {
  if (!Array.isArray(lines) || index <= 0 || index >= lines.length - 1) return null;
  const previous = normalize(lines[index - 1]);
  const current = normalize(lines[index]);
  const next = normalize(lines[index + 1]);
  if (!/^[-─━═]{8,}$/.test(previous) || !/^[-─━═]{8,}$/.test(next)) return null;
  const match = current.match(/^>\s*(.*)$/);
  if (!match) return null;
  return match[1].trim();
}

function hasTranscriptOutputAfterStructuralPrompt(lines, index) {
  if (!Array.isArray(lines)) return false;
  for (let nextIndex = index + 2; nextIndex < lines.length; nextIndex += 1) {
    const rawLine = lines[nextIndex];
    const line = normalize(rawLine);
    if (!line || /^[-─━═]{8,}$/.test(line)) continue;
    if (/^(?:⚕\s*)?❯\s*(?:$|\S.*)$/.test(line) || /^●\s+/.test(line)) return false;
    if (/^╭─\s*⚕\s*Hermes/i.test(line) || parseActivityHead(rawLine)) return true;
  }
  return false;
}

function parseMessages(text) {
  const lines = cleanAnsi(text).split(/\r?\n/);
  const messages = [];
  let inAssistantBox = false;
  let assistantLines = [];
  let inUserMessage = false;
  let userLines = [];

  const flushAssistant = () => {
    const contentLines = assistantLines
      .map(normalize)
      .filter((line) => !isNoise(line));
    const content = (shouldReflowAssistantLines(contentLines)
      ? joinWrappedAssistantLines(contentLines)
      : contentLines.join('\n'))
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

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = normalize(rawLine);
    if (!line) {
      if (inAssistantBox) assistantLines.push(line);
      continue;
    }

    const structuralPrompt = !inAssistantBox ? parseStructuralInputPromptLine(lines, index) : null;
    if (structuralPrompt !== null) {
      if (inUserMessage) flushUser();
      if (structuralPrompt && hasTranscriptOutputAfterStructuralPrompt(lines, index)) {
        inUserMessage = true;
        userLines = [structuralPrompt];
      }
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

    const activityHead = parseActivityHead(rawLine);
    if (activityHead) {
      const continuationLines = [];
      let nextIndex = index + 1;
      while (nextIndex < lines.length) {
        const nextRawLine = lines[nextIndex];
        const nextLine = normalize(nextRawLine);
        if (!nextLine) break;
        if (parseActivityHead(nextRawLine)
          || /^\p{Emoji}\uFE0F?\s+/u.test(nextRawLine.trimStart())
          || /^●\s+/.test(nextLine)
          || /^╭─\s*⚕\s*Hermes/i.test(nextLine)
          || /^╰─/.test(nextLine)
          || isPromptLine(nextLine)
          || /^[-─━═]{8,}$/.test(nextLine)) {
          break;
        }
        continuationLines.push(cleanAnsi(nextRawLine));
        nextIndex += 1;
      }

      const activityMessage = parseActivityMessage(rawLine, continuationLines);
      if (activityMessage) {
        if (inUserMessage) flushUser();
        if (inAssistantBox) {
          flushAssistant();
          inAssistantBox = false;
        }
        messages.push(activityMessage);
        index = nextIndex - 1;
        continue;
      }
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

  const historyState = extractHistoryState(transcript || screenText);
  const baseMessages = collapseReplayedAssistantHistory(trimMessagesForHistoryState(
    Array.isArray(input?.messages)
      ? input.messages
          .filter((message) => message && (message.role === 'user' || message.role === 'assistant'))
          .map((message) => ({
            role: message.role,
            kind: message.kind,
            senderName: message.senderName,
            content: String(message.content || ''),
          }))
      : [],
    historyState,
  ));
  const transcriptMessages = collapseReplayedAssistantHistory(trimMessagesForHistoryState(
    parseMessages(transcript || '')
      .map((message) => ({
        role: message.role,
        kind: message.kind,
        senderName: message.senderName,
        content: String(message.content || ''),
      })),
    historyState,
  ));
  const screenMessages = collapseReplayedAssistantHistory(trimMessagesForHistoryState(
    parseMessages(screenText || '')
      .map((message) => ({
        role: message.role,
        kind: message.kind,
        senderName: message.senderName,
        content: String(message.content || ''),
      })),
    historyState,
  ));
  const primaryRawMessages = transcriptMessages.length >= screenMessages.length
    ? transcriptMessages
    : screenMessages;
  const secondaryRawMessages = primaryRawMessages === transcriptMessages
    ? screenMessages
    : transcriptMessages;
  const rawMessages = mergeMessageHistories(primaryRawMessages, secondaryRawMessages);
  const coveredRawMessages = mergeCoveredTranscript(baseMessages, rawMessages);
  const preferredRawMessages = coveredRawMessages || rawMessages;
  const messages = trimMessagesForHistoryState(
    shouldPreferRawMessages({
      baseMessages,
      rawMessages,
      transcriptMessages,
      screenMessages,
    })
      ? preferredRawMessages
      : mergeMessageHistories(baseMessages, rawMessages),
    historyState,
  );
  const activeModal = parsedApproval || null;
  const effectiveStatus = activeModal ? 'waiting_approval' : status;
  const finalMessages = activeModal
    ? dedupeMessages([...collapseReplayedAssistantHistory(messages), createApprovalMessage(activeModal)])
    : collapseReplayedAssistantHistory(messages);
  const model = extractCurrentModel(screenText || transcript);
  const providerSessionId = extractProviderSessionId(transcript || screenText);

  return {
    id: 'cli_session',
    title: 'Hermes Agent',
    status: effectiveStatus,
    model,
    messages: finalMessages,
    activeModal,
    providerSessionId,
    ...historyState,
  };
};
