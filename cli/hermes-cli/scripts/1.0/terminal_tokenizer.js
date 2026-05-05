'use strict';

const {
  cleanAnsi,
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
    || /(?:^|\s)[│|]\s*[│|]?\s*[⏱⏲](?:\s*\d+(?:\.\d+)?\s*(?:ms|s|m|h))?/u.test(value)
    || /(?:^|\s)\d+(?:\.\d+)?[smh]\s*[│|]\s*[⏱⏲]/u.test(value);
}

function stripAssistantFooterNoise(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => String(line || '').trimEnd())
    .filter((line) => !isTransientAssistantFooterLine(line) && !isProtocolArtifactLine(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isProtocolArtifactLine(line) {
  const value = normalize(line);
  if (!value) return false;
  return /^(?:[A-Za-z]{1,8}\|)?readChatResult$/i.test(value);
}

function isNoise(line) {
  return !line
    || isProtocolArtifactLine(line)
    || /^[─═╭╮╰╯│┌┐└┘├┤┬┴┼]+$/.test(line)
    || /^\d+$/.test(line)
    || /^\d+(?:\.\d+)?\s*(?:ms|s|m|h)$/i.test(line)
    || /Hermes Agent v[0-9]/i.test(line)
    || /Available Tools|Available Skills/i.test(line)
    || isTransientAssistantFooterLine(line)
    || /Type your message or \/help for commands/i.test(line)
    || /Tip: hermes sessions prune/i.test(line)
    || /Enter to interrupt, Ctrl\+C to cancel/i.test(line)
    || /\bmsg\s*=\s*interrupt\b.*\bCtrl\+C\s+cancel\b/i.test(line)
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
const STATUS_DURATION_TOKEN_RE = /\d+(?:\.\d+)?\s*(?:ms|s|m|h)/iu;
const TRAILING_VISUAL_STATUS_RE = /\s+(?:(?<visual>[^\p{L}\p{M}\s]{1,32})\s+)?[\p{L}\p{M}][\p{L}\p{M}'’\-]{2,32}(?:\s+[\p{L}\p{M}][\p{L}\p{M}'’\-]{2,32}){0,2}(?:\.\.\.|…)\s*$/iu;
const ACTIVITY_DURATION_STATUS_SUFFIX_RE = /\s+\d+(?:\.\d+)?\s*(?:ms|s|m|h)(?:\s*[^\p{L}\p{N}\s]{1,16}|\s*\([^\n()]{1,32}\))?\s+[\p{L}\p{M}][\p{L}\p{M}'’\-]{2,32}(?:\s+[\p{L}\p{M}][\p{L}\p{M}'’\-]{2,32}){0,2}(?:\.\.\.|…)\s*$/iu;
const ACTIVITY_DURATION_SUFFIX_RE = /\s+\d+(?:\.\d+)?\s*(?:ms|s|m|h)\s*$/iu;

function stripTrailingVisualStatusSuffix(text) {
  const source = String(text || '').trim();
  if (!source) return '';
  const match = source.match(TRAILING_VISUAL_STATUS_RE);
  if (!match || typeof match.index !== 'number') return source;
  const suffix = source.slice(match.index);
  const prefix = source.slice(0, match.index).trim();
  if (!prefix) return source;
  // This is terminal redraw chrome only when the status phrase is introduced by
  // a visual status glyph/kaomoji or by a duration token from an activity row.
  // That keeps ordinary prose ending in "thinking..." intact.
  if (match.groups?.visual || STATUS_DURATION_TOKEN_RE.test(suffix)) {
    return prefix;
  }
  return source;
}

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
  if (cutIndex < 0) {
    return stripTrailingVisualStatusSuffix(source);
  }

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

  const tail = source.slice(-128);
  const mayHaveTransientSuffix = /[│┊]\s*$/u.test(tail)
    || /\d+(?:\.\d+)?\s*(?:ms|s|m|h)/iu.test(tail)
    || /(?:analyzing|ruminating|reasoning|thinking|processing|working|contemplating|brainstorming)(?:\.\.\.|…)\s*$/iu.test(tail);
  if (mayHaveTransientSuffix) {
    source = source
      .replace(ACTIVITY_DURATION_STATUS_SUFFIX_RE, '')
      .replace(ACTIVITY_TRANSIENT_PAREN_SUFFIX_RE, '')
      .replace(ACTIVITY_TRANSIENT_SECONDS_WORD_RE, '')
      .replace(ACTIVITY_DURATION_SUFFIX_RE, '')
      .replace(ACTIVITY_TRANSIENT_SECONDS_SUFFIX_RE, '')
      .replace(ACTIVITY_TRAILING_DIVIDER_RE, '')
      .trim();
  }

  return collapseRepeatedSkillActivity(source);
}

const STANDARD_ACTIVITY_PREFIX_RE = /^(?:📖|💻|🔎|📚|📋|✏️|📝|🔧|🛠️|⚙️)\s+(.+)$/u;

function isLikelyActivityPrefixContinuation(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return false;
  if (STANDARD_ACTIVITY_PREFIX_RE.test(trimmed)) return false;
  if (/\s/u.test(trimmed)) return false;
  if (/\p{Script=Hangul}/u.test(trimmed)) return false;
  if (trimmed.length > 96) return false;
  // Wrapped activity labels are usually path/command fragments such as
  // "l" + "i-parser.test.js" after "📖 .../codex-c". Do not treat
  // ordinary prose/list items as label continuations.
  return /^[\w./:@+%=-]+$/u.test(trimmed);
}

function parseStandardActivityPrefixBlock(lines, index) {
  const first = String(lines[index] || '').trim();
  const match = first.match(STANDARD_ACTIVITY_PREFIX_RE);
  if (!match) return null;

  const parts = [first];
  let nextIndex = index + 1;
  while (nextIndex < lines.length && isLikelyActivityPrefixContinuation(lines[nextIndex])) {
    parts.push(String(lines[nextIndex] || '').trim());
    nextIndex += 1;
  }

  return {
    label: parts.join(''),
    nextIndex,
  };
}

function stripRepeatedStandardActivityPrefixBlocks(text) {
  const source = String(text || '').trim();
  if (!source) return '';
  const lines = source.split(/\r?\n/);
  if (lines.length < 4) return source;

  const counts = new Map();
  for (let index = 0; index < lines.length; index += 1) {
    const block = parseStandardActivityPrefixBlock(lines, index);
    if (!block) continue;
    counts.set(block.label, (counts.get(block.label) || 0) + 1);
    index = block.nextIndex - 1;
  }

  const repeatedLabels = new Set([...counts.entries()]
    .filter(([, count]) => count >= 3)
    .map(([label]) => label));
  if (repeatedLabels.size === 0) return source;

  const stripped = [];
  let removed = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const block = parseStandardActivityPrefixBlock(lines, index);
    if (block && repeatedLabels.has(block.label)) {
      removed += 1;
      index = block.nextIndex - 1;
      continue;
    }
    stripped.push(lines[index]);
  }

  const next = stripped.join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  // Guard against removing legitimate content: only apply when this was a
  // repeated label artifact and substantial assistant prose remains.
  if (removed < 3 || next.length < 80) return source;
  return next;
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

function isStructuralRuleLine(line) {
  return /^[-─━═]{8,}$/.test(String(line || '').trim());
}

function isPromptLineText(line) {
  return /^(?:⚕\s*)?❯\s*(?:$|\S.*)$/.test(String(line || '').trim());
}

function isPlainAssistantCandidateLine(line) {
  const value = String(line || '').trim();
  if (!value) return false;
  return !isNoise(value)
    && !isStructuralRuleLine(value)
    && !isPromptLineText(value)
    && !/^●\s+/.test(value)
    && !STANDARD_ACTIVITY_PREFIX_RE.test(value)
    && !/^╭─\s*⚕\s*Hermes/i.test(value)
    && !/^╰─/.test(value);
}

function parseStructuralInputPromptLine(lines, index) {
  if (!Array.isArray(lines) || index <= 0 || index >= lines.length - 1) return null;
  const previous = normalize(lines[index - 1]);
  const current = normalize(lines[index]);
  const next = normalize(lines[index + 1]);
  if (!isStructuralRuleLine(previous) || !isStructuralRuleLine(next)) return null;
  const match = current.match(/^>\s*(.*)$/);
  if (!match) return null;
  return match[1].trim();
}

function hasTranscriptOutputAfterStructuralPrompt(lines, index) {
  if (!Array.isArray(lines)) return false;
  for (let nextIndex = index + 2; nextIndex < lines.length; nextIndex += 1) {
    const rawLine = lines[nextIndex];
    const line = normalize(rawLine);
    if (!line || isStructuralRuleLine(line)) continue;
    if (isPromptLineText(line) || /^●\s+/.test(line)) return false;
    if (/^╭─\s*⚕\s*Hermes/i.test(line) || parseActivityHead(rawLine)) return true;
    if (isPlainAssistantCandidateLine(line)) return true;
  }
  return false;
}

function expandFlattenedTerminalSnapshot(text) {
  const source = cleanAnsi(text);
  if (!source.trim()) return '';

  // Some terminal screen snapshots arrive as one physical row with Hermes box
  // boundaries, activity rows, prompt chrome, and assistant prose flattened into
  // spaces. Reintroduce the semantic boundaries before the normal line-based
  // tokenizer runs, otherwise a completed assistant box can be invisible to the
  // parser even though the text is present in the terminal snapshot.
  return source.split(/\r?\n/).map((line) => {
    if (!/[╭╰┊│]/u.test(line)) return line;
    return line
      .replace(/\s+(╭─\s*⚕\s*Hermes\b[^╮]*╮)\s*/giu, '\n$1\n')
      .replace(/\s+(╰[─━═]+╯)\s*/gu, '\n$1\n')
      .replace(/\s+([┊│]\s*(?:\p{Emoji}\uFE0F?|\$)\s+)/gu, '\n$1')
      .replace(/\s+(●\s+)/gu, '\n$1')
      .replace(/\s+(⚕\s*❯\s+)/gu, '\n$1')
      .replace(/^\n+/, '');
  }).join('\n').replace(/\n{3,}/g, '\n\n');
}

function parseMessages(text, options = {}) {
  const finalizeMessages = typeof options?.dedupeMessages === 'function'
    ? options.dedupeMessages
    : (messages) => messages;
  const lines = expandFlattenedTerminalSnapshot(text).split(/\r?\n/);
  const messages = [];
  let inAssistantBox = false;
  let assistantLines = [];
  let plainAssistantLines = [];
  let canStartPlainAssistant = false;
  let inUserMessage = false;
  let userLines = [];
  let userPromptStyle = 'unknown';

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

  const flushUser = (options = {}) => {
    const allowPlainAssistant = options.allowPlainAssistant !== false;
    const content = userLines
      .map(normalize)
      .filter((line) => line && !isNoise(line))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (content) {
      messages.push({ role: 'user', content });
      canStartPlainAssistant = allowPlainAssistant;
    }
    userLines = [];
    inUserMessage = false;
    userPromptStyle = 'unknown';
  };

  const isPromptLine = (line) => isPromptLineText(line);
  const flushPlainAssistant = () => {
    const contentLines = plainAssistantLines
      .map(normalize)
      .filter((line) => !isNoise(line));
    const content = (shouldReflowAssistantLines(contentLines)
      ? joinWrappedAssistantLines(contentLines)
      : contentLines.join('\n'))
      .trim();
    if (content) {
      messages.push({ role: 'assistant', content });
    }
    plainAssistantLines = [];
    canStartPlainAssistant = false;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = normalize(rawLine);
    if (!line) {
      if (inAssistantBox) assistantLines.push(line);
      continue;
    }

    const structuralPrompt = !inAssistantBox ? parseStructuralInputPromptLine(lines, index) : null;
    if (structuralPrompt !== null) {
      if (plainAssistantLines.length) flushPlainAssistant();
      if (inUserMessage) flushUser();
      if (structuralPrompt && hasTranscriptOutputAfterStructuralPrompt(lines, index)) {
        inUserMessage = true;
        userLines = [structuralPrompt];
        userPromptStyle = 'structural';
        canStartPlainAssistant = false;
      }
      continue;
    }

    if (/^●\s+/.test(line)) {
      if (plainAssistantLines.length) flushPlainAssistant();
      if (inAssistantBox) {
        flushAssistant();
        inAssistantBox = false;
      }
      if (inUserMessage) flushUser();
      const content = line.replace(/^●\s+/, '').trim();
      if (content) {
        inUserMessage = true;
        userLines = [content];
        userPromptStyle = 'bullet';
      }
      continue;
    }

    if (/^╭─\s*⚕\s*Hermes/i.test(line)) {
      if (plainAssistantLines.length) flushPlainAssistant();
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
          if (plainAssistantLines.length) flushPlainAssistant();
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
        if (plainAssistantLines.length) flushPlainAssistant();
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
        const allowPlainAssistant = userPromptStyle !== 'bullet' && !isPromptLine(line);
        flushUser({ allowPlainAssistant });
        if (isPromptLine(line)) continue;
      } else {
        userLines.push(line);
        continue;
      }
    }

    if (canStartPlainAssistant && isPlainAssistantCandidateLine(line)) {
      plainAssistantLines.push(line);
      continue;
    }

    if (inAssistantBox) {
      assistantLines.push(line);
    }
  }

  if (inUserMessage) flushUser();
  if (inAssistantBox) flushAssistant();
  if (plainAssistantLines.length) flushPlainAssistant();

  return finalizeMessages(messages);
}

module.exports = {
  normalize,
  isNoise,
  extractHistoryState,
  stripAssistantFooterNoise,
  restoreAssistantCodeFences,
  stripTransientPromptSuffix,
  stripActivityTransientSuffix,
  stripRepeatedStandardActivityPrefixBlocks,
  shouldReflowAssistantLines,
  joinWrappedAssistantLines,
  parseActivityHead,
  parseMessages,
};
