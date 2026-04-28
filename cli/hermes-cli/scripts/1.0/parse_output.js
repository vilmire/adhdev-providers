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

function isTransientAssistantFooterLine(line) {
  const value = normalize(line);
  if (!value) return false;
  return /gpt-5\.\d/i.test(value)
    || /ctx --/i.test(value)
    || /\b\d+(?:\.\d+)?K\/\d+(?:\.\d+)?[KM]?\b/i.test(value)
    || /(?:^|\s)\d*(?:\.\d+)?K\/\s*[│|].*\[[█░\s]+\]\s*\d+%/iu.test(value)
    || /\[[█░\s]+\]\s*\d+%/iu.test(value)
    || /(?:^|\s)[│|]\s*[│|]?\s*[⏱⏲]\b/u.test(value)
    || /(?:^|\s)\d+(?:\.\d+)?[smh]\s*[│|]\s*[⏱⏲]\b/u.test(value);
}

function stripAssistantFooterNoise(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => String(line || '').trimEnd())
    .filter((line) => !isTransientAssistantFooterLine(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isNoise(line) {
  return !line
    || /^[─═╭╮╰╯│┌┐└┘├┤┬┴┼]+$/.test(line)
    || /^\d+$/.test(line)
    || /Hermes Agent v[0-9]/i.test(line)
    || /Available Tools|Available Skills/i.test(line)
    || isTransientAssistantFooterLine(line)
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
  'brainstorming',
];

const TRANSIENT_STATUS_PATTERN = TRANSIENT_STATUS_WORDS.join('|');
const ACTIVITY_TRANSIENT_PAREN_SUFFIX_RE = new RegExp(`\\s*\\([^\\n()]{1,32}\\)\\s*(?:${TRANSIENT_STATUS_PATTERN})(?:\\.\\.\\.|…)?\\s*$`, 'iu');
const ACTIVITY_TRANSIENT_SECONDS_WORD_RE = new RegExp(`\\s+\\d+(?:\\.\\d+)?s\\s*(?:${TRANSIENT_STATUS_PATTERN})(?:\\.\\.\\.|…)?\\s*$`, 'iu');
const ACTIVITY_TRANSIENT_SECONDS_SUFFIX_RE = /\s+\d+(?:\.\d+)?s\s*$/u;
const ACTIVITY_TRAILING_DIVIDER_RE = /\s*[│┊]\s*$/u;
const normalizedMessageCache = new WeakMap();
const comparableContentCache = new WeakMap();
const compactComparableContentCache = new WeakMap();

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

function collapseRepeatedSkillActivity(text) {
  const source = String(text || '').trim();
  if (!source) return '';
  if (!/\bskill\s+/iu.test(source)) return source;

  // Hermes redraw artifacts can lose the leading "skill " prefix from the
  // first visible copy, leaving forms such as:
  //   provider-live-transcript-plumbingskill provider-live-transcript-plumbing
  // Treat bare slug copies as redraw fragments only when every parsed token is
  // the same slug and the remaining characters are just redraw separators.
  const repeatedSkillRe = /(?:@?skill\s+)?([A-Za-z0-9][A-Za-z0-9_-]*?)(?=$|[•.\s@]|skill\s)/giu;
  const matches = Array.from(source.matchAll(repeatedSkillRe))
    .map((match) => String(match[1] || '').trim())
    .filter(Boolean);
  if (matches.length < 2) return source;

  const [first] = matches;
  if (!first || !matches.every((value) => value === first)) return source;

  const nonSkillRemainder = source.replace(repeatedSkillRe, '').replace(/[•.\s@]+/gu, '');
  if (nonSkillRemainder) return source;

  return `skill ${first}`;
}

function stripActivityTransientSuffix(text) {
  let source = String(text || '').trim();
  if (!source) return '';

  source = source
    .replace(ACTIVITY_TRANSIENT_PAREN_SUFFIX_RE, '')
    .replace(ACTIVITY_TRANSIENT_SECONDS_WORD_RE, '')
    .replace(ACTIVITY_TRANSIENT_SECONDS_SUFFIX_RE, '')
    .replace(ACTIVITY_TRAILING_DIVIDER_RE, '')
    .trim();

  return collapseRepeatedSkillActivity(source);
}

function normalizeMessage(message) {
  if (message && typeof message === 'object') {
    const cached = normalizedMessageCache.get(message);
    if (cached
      && cached.role === message.role
      && cached.kind === message.kind
      && cached.senderName === message.senderName
      && cached.content === message.content
      && cached.id === message.id
      && cached.bubbleId === message.bubbleId
      && cached.providerUnitKey === message.providerUnitKey
      && cached._turnKey === message._turnKey
      && cached.bubbleState === message.bubbleState
      && cached.meta === message.meta) {
      return cached.normalized;
    }
  }
  const role = message?.role === 'user' ? 'user' : 'assistant';
  const kind = typeof message?.kind === 'string' && message.kind ? message.kind : 'standard';
  const rawContent = String(message?.content || '').trim();
  const normalizedContent = role === 'user'
    ? stripTransientPromptSuffix(rawContent)
    : (role === 'assistant' && (kind === 'tool' || kind === 'terminal')
        ? stripActivityTransientSuffix(rawContent)
        : rawContent);
  const normalized = {
    role,
    kind,
    senderName: typeof message?.senderName === 'string' && message.senderName ? message.senderName : undefined,
    content: role === 'assistant' && kind === 'standard'
      ? restoreAssistantCodeFences(stripAssistantFooterNoise(normalizedContent))
      : normalizedContent,
  };
  if (typeof message?.id === 'string' && message.id) normalized.id = message.id;
  if (typeof message?.bubbleId === 'string' && message.bubbleId) normalized.bubbleId = message.bubbleId;
  if (typeof message?.providerUnitKey === 'string' && message.providerUnitKey) normalized.providerUnitKey = message.providerUnitKey;
  if (typeof message?._turnKey === 'string' && message._turnKey) normalized._turnKey = message._turnKey;
  if (typeof message?.bubbleState === 'string' && message.bubbleState) normalized.bubbleState = message.bubbleState;
  if (message?.meta && typeof message.meta === 'object' && !Array.isArray(message.meta)) {
    normalized.meta = { ...message.meta };
  }
  if (message && typeof message === 'object') {
    normalizedMessageCache.set(message, {
      role: message.role,
      kind: message.kind,
      senderName: message.senderName,
      content: message.content,
      id: message.id,
      bubbleId: message.bubbleId,
      providerUnitKey: message.providerUnitKey,
      _turnKey: message._turnKey,
      bubbleState: message.bubbleState,
      meta: message.meta,
      normalized,
    });
  }
  return normalized;
}

function isLikelyTruncatedDuplicate(longer, shorter, options = {}) {
  if (!longer || !shorter) return false;
  if (longer.length <= shorter.length) return false;
  const minLength = typeof options.minLength === 'number' ? options.minLength : 48;
  if (shorter.length < minLength) return false;
  return longer.startsWith(shorter) || longer.includes(shorter);
}

function getComparableContent(message) {
  if (message && typeof message === 'object') {
    const cached = comparableContentCache.get(message);
    if (cached
      && cached.role === message.role
      && cached.kind === message.kind
      && cached.senderName === message.senderName
      && cached.content === message.content) {
      return cached.comparable;
    }
  }
  const normalized = normalizeMessage(message);
  const rawContent = String(normalized.content || '').trim();
  if (!rawContent) return '';

  let comparable;
  if (normalized.role === 'assistant' && normalized.kind === 'standard') {
    const contentLines = rawContent
      .split(/\r?\n/)
      .map(normalize)
      .filter(Boolean);
    const prose = shouldReflowAssistantLines(contentLines)
      ? joinWrappedAssistantLines(contentLines)
      : contentLines.join('\n');
    comparable = prose.replace(/\s+/g, ' ').trim();
  } else {
    comparable = rawContent.replace(/\s+/g, ' ').trim();
  }

  if (message && typeof message === 'object') {
    comparableContentCache.set(message, {
      role: message.role,
      kind: message.kind,
      senderName: message.senderName,
      content: message.content,
      comparable,
    });
  }
  return comparable;
}

function getCompactComparableContent(message) {
  if (message && typeof message === 'object') {
    const cached = compactComparableContentCache.get(message);
    if (cached
      && cached.role === message.role
      && cached.kind === message.kind
      && cached.senderName === message.senderName
      && cached.content === message.content) {
      return cached.compactComparable;
    }
  }
  const compactComparable = getComparableContent(message).replace(/\s+/g, '');
  if (message && typeof message === 'object') {
    compactComparableContentCache.set(message, {
      role: message.role,
      kind: message.kind,
      senderName: message.senderName,
      content: message.content,
      compactComparable,
    });
  }
  return compactComparable;
}

const LINE_ELISION_MARKER_RE = /\s*\.{3}\s*\(\+\d+\s*more\s*lines\)\s*/iu;

function isLikelyLineElidedDuplicate(longer, shorter, options = {}) {
  if (!longer || !shorter) return false;
  if (longer.length <= shorter.length) return false;
  const minLength = typeof options.minLength === 'number' ? options.minLength : 48;
  if (shorter.length < minLength) return false;

  const parts = String(shorter).split(LINE_ELISION_MARKER_RE);
  if (parts.length < 2) return false;
  const prefix = parts[0].trim();
  const suffix = parts.slice(1).join(' ').trim();
  const edgeMinLength = Math.min(32, Math.max(12, Math.floor(minLength / 2)));
  if (prefix.length < edgeMinLength || suffix.length < edgeMinLength) return false;

  const prefixIndex = String(longer).indexOf(prefix);
  if (prefixIndex < 0) return false;
  const suffixIndex = String(longer).indexOf(suffix, prefixIndex + prefix.length);
  return suffixIndex >= 0;
}

function comparableContentsMatch(left, right, minLength) {
  return left === right
    || isLikelyTruncatedDuplicate(left, right, { minLength })
    || isLikelyTruncatedDuplicate(right, left, { minLength })
    || isLikelyLineElidedDuplicate(left, right, { minLength })
    || isLikelyLineElidedDuplicate(right, left, { minLength });
}

function messagesMatch(left, right) {
  const a = normalizeMessage(left);
  const b = normalizeMessage(right);
  if (!a.content || !b.content || a.role !== b.role || a.kind !== b.kind) return false;
  // Hermes can expose the same submitted prompt through three sources at once:
  // committed adapter history, truncated terminal scrollback, and a fuller visible
  // screen prompt. Use the same short-prefix tolerance as assistant prose for
  // standard user prompts so those variants merge into the most complete prompt.
  const duplicateMinLength = a.kind === 'standard'
    ? (a.role === 'assistant' || a.role === 'user' ? 8 : 48)
    : 48;
  const aComparable = getComparableContent(a);
  const bComparable = getComparableContent(b);
  if (comparableContentsMatch(aComparable, bComparable, duplicateMinLength)) return true;
  if (a.kind !== 'standard' || b.kind !== 'standard') return false;
  const aCompactComparable = getCompactComparableContent(a);
  const bCompactComparable = getCompactComparableContent(b);
  return comparableContentsMatch(aCompactComparable, bCompactComparable, duplicateMinLength);
}

function withMergedMessageIdentity(preferred, fallback) {
  const result = {
    role: preferred.role,
    kind: preferred.kind || fallback.kind,
    senderName: preferred.senderName || fallback.senderName,
    content: preferred.content,
  };
  for (const key of ['id', 'bubbleId', 'providerUnitKey', '_turnKey', 'bubbleState']) {
    if (preferred[key]) result[key] = preferred[key];
    else if (fallback[key]) result[key] = fallback[key];
  }
  if (preferred.meta && typeof preferred.meta === 'object') result.meta = { ...preferred.meta };
  else if (fallback.meta && typeof fallback.meta === 'object') result.meta = { ...fallback.meta };
  return result;
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
    return withMergedMessageIdentity(preferred, fallback);
  }

  const preferred = bComparable.length > aComparable.length ? b : a;
  const fallback = preferred === a ? b : a;
  return withMergedMessageIdentity(preferred, fallback);
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

const ACTIVITY_SOFT_WRAP_MIN_COLUMNS = 64;

function isLikelySoftWrappedActivityPhysicalLine(rawLine) {
  const line = cleanAnsi(rawLine).replace(/\s+$/u, '');
  if (!line) return false;
  // Hermes activity continuation support is for terminal soft-wraps: the prior
  // physical row should have reached close to the terminal edge. Do not attach
  // arbitrary prose after a short completed activity row; otherwise a final
  // answer can be swallowed into the preceding terminal bubble.
  return line.length >= ACTIVITY_SOFT_WRAP_MIN_COLUMNS;
}

const KNOWN_INLINE_TOOL_LABELS = new Set([
  'browser_console',
]);

function parseInlineToolLabelLeak(line) {
  const head = parseActivityHead(line);
  if (!head) return null;
  const body = normalizeActivityBody([head.body]);
  if (!body) return null;
  for (const label of KNOWN_INLINE_TOOL_LABELS) {
    if (body === label) {
      return { label, content: '' };
    }
    if (!body.startsWith(label)) continue;
    const rest = body.slice(label.length);
    // Real activity rows use a delimiter after the tool name, e.g.
    // "browser_console expression=...". A line like
    // "browser_console현재 ..." means the rendered tool label leaked into
    // assistant prose and must not become a separate tool bubble.
    if (!rest || /^\s/.test(rest) || /^[=:({[]/.test(rest)) continue;
    return { label, content: rest.trimStart() };
  }
  return null;
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
    ...(message.id ? { id: message.id } : { id: `msg_${index}` }),
    role: message.role,
    content: message.content,
    index,
    kind: message.kind || 'standard',
    ...(message.senderName ? { senderName: message.senderName } : {}),
    ...(message.bubbleId ? { bubbleId: message.bubbleId } : {}),
    ...(message.providerUnitKey ? { providerUnitKey: message.providerUnitKey } : {}),
    ...(message._turnKey ? { _turnKey: message._turnKey } : {}),
    ...(message.bubbleState ? { bubbleState: message.bubbleState } : {}),
    ...(message.meta && typeof message.meta === 'object' ? { meta: { ...message.meta } } : {}),
  }));
}

function isStableAssistantAnswer(message) {
  const normalized = normalizeMessage(message);
  return normalized.role === 'assistant'
    && normalized.kind === 'standard'
    && String(normalized.content || '').length >= 80;
}

function compactIndexToRawIndex(rawText, compactIndex) {
  const source = String(rawText || '');
  let compactCursor = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (/\s/u.test(source[index])) continue;
    if (compactCursor === compactIndex) return index;
    compactCursor += 1;
  }
  return -1;
}

function trimStableAssistantTextFromActivityMessage(message, stableAssistant) {
  const normalized = normalizeMessage(message);
  const kind = normalized.kind || 'standard';
  if (normalized.role !== 'assistant' || (kind !== 'terminal' && kind !== 'tool') || !isStableAssistantAnswer(stableAssistant)) {
    return normalized;
  }

  const stableCompact = getCompactComparableContent(stableAssistant);
  if (stableCompact.length < 16) return normalized;

  const rawContent = String(normalized.content || '');
  const rawCompact = rawContent.replace(/\s+/g, '');
  const compactIndex = rawCompact.indexOf(stableCompact);
  if (compactIndex <= 0) return normalized;

  const rawIndex = compactIndexToRawIndex(rawContent, compactIndex);
  if (rawIndex <= 0) return normalized;

  const trimmedContent = stripActivityTransientSuffix(rawContent.slice(0, rawIndex));
  if (!trimmedContent) return normalized;
  return {
    ...normalized,
    content: trimmedContent,
  };
}

function buildReplayMessageSignature(message) {
  const normalized = normalizeMessage(message);
  const content = getComparableContent(normalized) || getCompactComparableContent(normalized);
  if (!content) return '';
  return [
    normalized.role || '',
    normalized.kind || 'standard',
    normalized.senderName || '',
    content,
  ].join('\u0000');
}

function buildTurnPromptFingerprint(message) {
  const normalized = normalizeMessage(message);
  const compact = getCompactComparableContent(normalized) || getComparableContent(normalized);
  if (!compact) return '';
  return compact.slice(0, 24);
}

function replayComparableContentsMatch(left, right, minLength) {
  if (!left || !right) return false;
  if (left === right) return true;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;
  return shorter.length >= minLength && longer.startsWith(shorter);
}

function replayTurnMessagesMatch(leftTurnMessages, rightTurnMessages) {
  if (!Array.isArray(leftTurnMessages) || !Array.isArray(rightTurnMessages)) return false;
  if (leftTurnMessages.length !== rightTurnMessages.length) return false;

  for (let index = 0; index < leftTurnMessages.length; index += 1) {
    const left = normalizeMessage(leftTurnMessages[index]);
    const right = normalizeMessage(rightTurnMessages[index]);
    const leftKind = left.kind || 'standard';
    const rightKind = right.kind || 'standard';
    if (left.role !== right.role || leftKind !== rightKind || (left.senderName || '') !== (right.senderName || '')) {
      return false;
    }

    const leftComparable = getCompactComparableContent(left) || getComparableContent(left);
    const rightComparable = getCompactComparableContent(right) || getComparableContent(right);
    if (!leftComparable || !rightComparable) return false;

    if (left.role === 'user') {
      if (!replayComparableContentsMatch(leftComparable, rightComparable, 24)) return false;
      continue;
    }

    if (left.role === 'assistant' && leftKind === 'standard') {
      if (!replayComparableContentsMatch(leftComparable, rightComparable, 80)) return false;
      continue;
    }

    if (leftComparable !== rightComparable) return false;
  }

  return true;
}

function isReplayedAssistantAnswerAfterStableAssistant(message, stableAnswer) {
  const normalized = normalizeMessage(message);
  const stable = normalizeMessage(stableAnswer);
  if (normalized.role !== 'assistant' || stable.role !== 'assistant') return false;
  if ((normalized.kind || 'standard') !== 'standard' || (stable.kind || 'standard') !== 'standard') return false;

  const content = getComparableContent(normalized);
  const stableContent = getComparableContent(stable);
  if (!content || !stableContent) return false;
  if (content === stableContent) return true;

  const shorterLength = Math.min(content.length, stableContent.length);
  return shorterLength >= 80 && (content.startsWith(stableContent) || stableContent.startsWith(content));
}

function isAssistantReplayAfterStableAssistant(merged, cursor, message) {
  if (!Array.isArray(merged) || cursor <= 0) return false;
  const stable = merged[cursor - 1];
  if (!isStableAssistantAnswer(stable)) return false;
  return isReplayedAssistantAnswerAfterStableAssistant(message, stable);
}

function collapseReplayedAssistantHistory(messages) {
  const source = dedupeMessages(Array.isArray(messages) ? messages : [])
    .map(normalizeMessage)
    .filter((message) => message.content);
  const collapsed = [];
  let stableAssistant = null;
  const seenAssistantSignatures = new Set();
  const canUseReplaySignatureSet = source.length < 1000
    || source.some((message) => message.role === 'user' || (message.kind || 'standard') === 'standard');

  for (let index = 0; index < source.length; index += 1) {
    const message = source[index];
    let normalized = normalizeMessage(message);
    if (normalized.role === 'user') {
      collapsed.push(normalized);
      stableAssistant = null;
      seenAssistantSignatures.clear();
      continue;
    }

    normalized = trimStableAssistantTextFromActivityMessage(normalized, stableAssistant);
    const replaySignature = canUseReplaySignatureSet && normalized.role === 'assistant'
      ? buildReplayMessageSignature(normalized)
      : '';
    if (replaySignature && seenAssistantSignatures.has(replaySignature)) {
      continue;
    }

    if (stableAssistant && isReplayedAssistantAnswerAfterStableAssistant(normalized, stableAssistant)) {
      continue;
    }

    collapsed.push(normalized);
    if (replaySignature) seenAssistantSignatures.add(replaySignature);
    if (isStableAssistantAnswer(normalized)) {
      stableAssistant = normalized;
    }
  }

  return collapseRepeatedTurnReplays(dedupeMessages(collapsed));
}

function collapseRepeatedTurnReplays(messages) {
  const source = (Array.isArray(messages) ? messages : [])
    .map(normalizeMessage)
    .filter((message) => message.content);
  if (source.length < 2) return dedupeMessages(source);

  const collapsed = [];
  const seenReplayTurns = [];
  let index = 0;

  while (index < source.length) {
    const message = source[index];
    if (message.role !== 'user') {
      collapsed.push(message);
      index += 1;
      continue;
    }

    let nextIndex = index + 1;
    while (nextIndex < source.length && source[nextIndex].role !== 'user') {
      nextIndex += 1;
    }

    const turnMessages = source.slice(index, nextIndex);
    const hasReplayProneActivity = turnMessages.some((turnMessage) => (
      turnMessage.role === 'assistant'
      && turnMessage.kind
      && turnMessage.kind !== 'standard'
    ));
    const isReplayDuplicate = hasReplayProneActivity
      && seenReplayTurns.some((seenTurnMessages) => replayTurnMessagesMatch(seenTurnMessages, turnMessages));

    if (!isReplayDuplicate) {
      collapsed.push(...turnMessages);
      if (hasReplayProneActivity) seenReplayTurns.push(turnMessages);
    }

    index = nextIndex;
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
  if (merged.length === 0) return current;
  if (current.length === 0) return merged;

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

  return collapseRepeatedTurnReplays(dedupeMessages(merged));
}

function stableHash(value) {
  const input = String(value || '');
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function identityComparableContent(message) {
  const normalized = normalizeMessage(message);
  const compact = getCompactComparableContent(normalized);
  return compact || getComparableContent(normalized) || String(normalized.content || '').trim();
}

function buildProviderMessageId(providerUnitKey) {
  return `hermes_${stableHash(providerUnitKey)}`;
}

function assignProviderOwnedTranscriptIdentity(messages, status) {
  const source = (Array.isArray(messages) ? messages : [])
    .map(normalizeMessage)
    .filter((message) => message.content);
  const result = [];
  const turnCounts = new Map();
  let currentTurnKey = '';
  let currentTurnAssistantStandardOrdinal = 0;
  let currentTurnUserPrompt = '';
  const unitCountsByTurn = new Map();

  const ensureFallbackTurn = () => {
    if (currentTurnKey) return currentTurnKey;
    currentTurnKey = 'turn_orphan';
    currentTurnAssistantStandardOrdinal = 0;
    currentTurnUserPrompt = '';
    if (!unitCountsByTurn.has(currentTurnKey)) unitCountsByTurn.set(currentTurnKey, new Map());
    return currentTurnKey;
  };

  for (const message of source) {
    if (message.role === 'user') {
      const promptComparable = buildTurnPromptFingerprint(message) || identityComparableContent(message);
      const promptHash = stableHash(promptComparable).slice(0, 12);
      const promptCount = (turnCounts.get(promptHash) || 0) + 1;
      turnCounts.set(promptHash, promptCount);
      currentTurnKey = `turn_${promptCount}_${promptHash}`;
      currentTurnAssistantStandardOrdinal = 0;
      currentTurnUserPrompt = promptComparable;
      if (!unitCountsByTurn.has(currentTurnKey)) unitCountsByTurn.set(currentTurnKey, new Map());
    } else {
      ensureFallbackTurn();
    }

    const turnKey = ensureFallbackTurn();
    const unitCounts = unitCountsByTurn.get(turnKey) || new Map();
    let unitStem;
    if (message.role === 'user') {
      unitStem = `user:${stableHash(currentTurnUserPrompt).slice(0, 12)}`;
    } else if ((message.kind || 'standard') === 'standard') {
      const ordinal = currentTurnAssistantStandardOrdinal;
      currentTurnAssistantStandardOrdinal += 1;
      unitStem = `assistant:standard:${ordinal}`;
    } else {
      const kind = message.kind || 'standard';
      const contentHash = stableHash(identityComparableContent(message)).slice(0, 12);
      const baseStem = `assistant:${kind}:${contentHash}`;
      const occurrence = (unitCounts.get(baseStem) || 0) + 1;
      unitCounts.set(baseStem, occurrence);
      unitStem = occurrence > 1 ? `${baseStem}:${occurrence}` : baseStem;
    }
    unitCountsByTurn.set(turnKey, unitCounts);

    const providerUnitKey = `hermes-cli:${turnKey}:${unitStem}`;
    const id = buildProviderMessageId(providerUnitKey);
    const next = {
      ...message,
      id,
      bubbleId: id,
      providerUnitKey,
      _turnKey: turnKey,
      bubbleState: 'final',
    };
    result.push(next);
  }

  const streamLikeStatus = status === 'generating' || status === 'streaming' || status === 'long_generating';
  if (streamLikeStatus) {
    for (let index = result.length - 1; index >= 0; index -= 1) {
      const message = result[index];
      if (message.role === 'assistant' && (message.kind || 'standard') === 'standard') {
        result[index] = {
          ...message,
          bubbleState: 'streaming',
          meta: {
            ...(message.meta && typeof message.meta === 'object' ? message.meta : {}),
            streaming: true,
          },
        };
        break;
      }
    }
  }

  return result;
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

    if (inAssistantBox) {
      assistantLines.push(line);
      continue;
    }

    const activityHead = parseActivityHead(rawLine);
    if (activityHead) {
      const inlineLeak = parseInlineToolLabelLeak(rawLine);
      if (inlineLeak) {
        const contentLines = [inlineLeak.content];
        let nextIndex = index + 1;
        while (nextIndex < lines.length) {
          const nextLeak = parseInlineToolLabelLeak(lines[nextIndex]);
          if (!nextLeak || nextLeak.label !== inlineLeak.label) break;
          contentLines.push(nextLeak.content);
          nextIndex += 1;
        }
        const content = contentLines.join('\n').trim();
        if (content) {
          if (inUserMessage) flushUser();
          if (inAssistantBox) {
            flushAssistant();
            inAssistantBox = false;
          }
          messages.push({ role: 'assistant', content });
        }
        index = nextIndex - 1;
        continue;
      }

      const continuationLines = [];
      let nextIndex = index + 1;
      while (nextIndex < lines.length) {
        const nextRawLine = lines[nextIndex];
        const nextLine = normalize(nextRawLine);
        const previousActivityPhysicalLine = continuationLines.length > 0
          ? continuationLines[continuationLines.length - 1]
          : rawLine;
        if (!nextLine) break;
        if (!isLikelySoftWrappedActivityPhysicalLine(previousActivityPhysicalLine)) break;
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
          .map((message) => normalizeMessage({
            role: message.role,
            kind: message.kind,
            senderName: message.senderName,
            content: String(message.content || ''),
            id: message.id,
            bubbleId: message.bubbleId,
            providerUnitKey: message.providerUnitKey,
            _turnKey: message._turnKey,
            bubbleState: message.bubbleState,
            meta: message.meta,
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
  const identifiedMessages = assignProviderOwnedTranscriptIdentity(finalMessages, effectiveStatus);
  const model = extractCurrentModel(screenText || transcript);
  const providerSessionId = extractProviderSessionId(transcript || screenText);

  return {
    id: 'cli_session',
    title: 'Hermes Agent',
    status: effectiveStatus,
    model,
    messages: identifiedMessages,
    activeModal,
    providerSessionId,
    currentTurnId: identifiedMessages.length > 0 ? identifiedMessages[identifiedMessages.length - 1]._turnKey : undefined,
    ...historyState,
  };
};
