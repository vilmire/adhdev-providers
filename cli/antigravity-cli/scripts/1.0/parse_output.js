'use strict';

const detectStatus = require('./detect_status.js');
const parseApproval = require('./parse_approval.js');
const nativeHistory = require('../../../_shared/native_history.js');

function stripAnsi(text) {
  return String(text || '')
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001b[>=]/g, '')
    .replace(/\u0007/g, '');
}

function splitLines(text) {
  return stripAnsi(text)
    .split(/\r\n|\n|\r/g)
    .map((line) => line.replace(/^\d+;/, '').replace(/\s+$/, ''));
}

function normalize(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function sourceText(input) {
  const candidates = [input?.buffer, input?.recentBuffer, input?.screenText, input?.tail];
  for (const value of candidates) {
    const text = String(value || '');
    if (stripAnsi(text).trim()) return text;
  }
  return '';
}

const HIGH_TRAFFIC_RETRY_DELAYS_MS = [3000, 6000, 9000];

function detectHighTrafficError(text) {
  const source = stripAnsi(text);
  if (!/servers?\s+are\s+experiencing\s+high\s+traffic/i.test(source)) return null;
  return {
    errorReason: 'provider_unavailable_high_traffic',
    errorMessage: 'Antigravity CLI reported server high traffic. Retry later.',
  };
}

function buildHighTrafficRetry(state, promptText, screenText) {
  if (!state || typeof state !== 'object') return {};
  const fingerprint = normalize(promptText) || normalize(screenText).slice(-500) || 'antigravity-high-traffic';
  const previous = state.highTrafficRetry && typeof state.highTrafficRetry === 'object'
    ? state.highTrafficRetry
    : null;
  const now = Date.now();
  const previousAttempts = previous?.fingerprint === fingerprint
    ? Number(previous.attempts || 0)
    : 0;
  const previousDelayMs = Number(previous?.delayMs || 0);
  const previousIssuedAt = Number(previous?.issuedAt || 0);
  if (
    previous?.fingerprint === fingerprint
    && previousAttempts > 0
    && previousAttempts <= HIGH_TRAFFIC_RETRY_DELAYS_MS.length
    && now < previousIssuedAt + previousDelayMs + 500
  ) {
    return {
      retryPrompt: 'continue',
      retryDelayMs: previousDelayMs,
      retryAttempt: previousAttempts,
      retryMaxAttempts: HIGH_TRAFFIC_RETRY_DELAYS_MS.length,
    };
  }
  if (previousAttempts >= HIGH_TRAFFIC_RETRY_DELAYS_MS.length) {
    state.highTrafficRetry = { fingerprint, attempts: previousAttempts, delayMs: previousDelayMs, issuedAt: previousIssuedAt };
    return {};
  }
  const nextAttempt = previousAttempts + 1;
  const retryDelayMs = HIGH_TRAFFIC_RETRY_DELAYS_MS[nextAttempt - 1];
  state.highTrafficRetry = { fingerprint, attempts: nextAttempt, delayMs: retryDelayMs, issuedAt: now };
  return {
    retryPrompt: 'continue',
    retryDelayMs,
    retryAttempt: nextAttempt,
    retryMaxAttempts: HIGH_TRAFFIC_RETRY_DELAYS_MS.length,
  };
}

function getLastUserPrompt(input) {
  if (typeof input?.promptText === 'string' && input.promptText.trim()) return input.promptText.trim();
  const messages = Array.isArray(input?.messages) ? input.messages : [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === 'user' && typeof message.content === 'string' && message.content.trim()) {
      return message.content.trim();
    }
  }
  return '';
}

function getLastUserPromptFromMessages(messages) {
  const slice = Array.isArray(messages) ? messages : [];
  for (let i = slice.length - 1; i >= 0; i -= 1) {
    const message = slice[i];
    if (message?.role === 'user' && typeof message.content === 'string' && message.content.trim()) {
      return message.content.trim();
    }
  }
  return '';
}

function isPromptStart(line) {
  return /^>\s*\S/.test(line || '');
}

function isEmptyPrompt(line) {
  return normalize(line) === '>';
}

function isSeparator(line) {
  return /^[─\-]{20,}$/.test(normalize(line));
}

function isFooterLine(line) {
  const text = normalize(line);
  return !text
    || isEmptyPrompt(text)
    || /^\?\s+for\s+shortcuts\b/i.test(text)
    || /^thinking for\b/i.test(text)
    || /\besc to cancel\b/i.test(text)
    || /^gemini .*\(high\)$/i.test(text)
    || /^how's the cli experience so far\?/i.test(text)
    || /^\[[0-3]\]\s+good/i.test(text)
    || isSeparator(text);
}

function isHeaderNoise(line) {
  const text = normalize(line);
  return !text
    || /^▄▀▀▄/.test(text)
    || /^▀▀▀▀▀▀/.test(text)
    || /^▀▀▀▀▀▀▀▀/.test(text)
    || /^▄▀▀\s+▀▀▄/.test(text)
    || /^▄▀▀\s+▀▀▄\s+\/.*/.test(text)
    || /antigravity cli \d+\.\d+\.\d+/i.test(text)
    || /google ai ultra/i.test(text)
    || /gemini 3\.5 flash \(high\)/i.test(text)
    || /^signed in as:/i.test(text)
    || /^welcome to the antigravity cli/i.test(text)
    || /^yes,\s+i\s+trust\s+this/i.test(text)
    || /^no,\s+exit/i.test(text)
    || /^↑\/↓\s+navigate/i.test(text)
    || /^accessing workspace:/i.test(text);
}

function shouldStayInUserBlock(line) {
  const text = normalize(line);
  return !!text
    && !isPromptStart(line)
    && !isFooterLine(line)
    && !/^●\s+/.test(text)
    && !/^command$/i.test(text)
    && !/^⎿\b/.test(text)
    && !/generating\.\.\./i.test(text);
}

function shouldKeepAssistantLine(line) {
  const text = normalize(line);
  return !!text
    && !isFooterLine(line)
    && !isHeaderNoise(line)
    && !/^●\s+/.test(text)
    && !/^⎿\b/.test(text);
}

function isLikelyChromeLine(line) {
  const text = normalize(line);
  return !text
    || /^claude\s+sonnet\b/i.test(text)
    || /^gemini\b/i.test(text)
    || /^\/([A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/.test(text);
}

function normalizeMessage(message) {
  if (!message || (message.role !== 'user' && message.role !== 'assistant')) return null;
  const content = String(message.content || '').trim();
  if (!content) return null;
  return { role: message.role, content };
}

function pushDeduped(messages, role, content) {
  const text = String(content || '').trim();
  if (!text) return;
  const last = messages[messages.length - 1];
  if (last?.role === role && normalize(last.content) === normalize(text)) return;
  messages.push({ role, content: text });
}

function findPromptLineIndex(lines, promptText) {
  const normalizedPrompt = normalize(promptText);
  if (!normalizedPrompt) return -1;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (normalize(lines[i]) === normalizedPrompt) return i;
  }
  return -1;
}

function collectMeaningfulLines(screenText) {
  return splitLines(screenText).filter((line) => {
    const text = normalize(line);
    return !!text && !isFooterLine(line) && !isHeaderNoise(line);
  });
}

function extractFallbackAssistantText(screenText, promptText) {
  const meaningfulLines = collectMeaningfulLines(screenText);
  if (meaningfulLines.length === 0 || !normalize(promptText)) return '';

  const promptIndex = findPromptLineIndex(meaningfulLines, promptText);
  if (promptIndex >= 0) {
    return meaningfulLines.slice(promptIndex + 1).join('\n').trim();
  }

  return meaningfulLines.filter((line) => !isLikelyChromeLine(line)).join('\n').trim();
}

function mergeMessages(previousMessages, incomingMessages) {
  const base = Array.isArray(previousMessages)
    ? previousMessages.map(normalizeMessage).filter(Boolean)
    : [];
  const incoming = Array.isArray(incomingMessages)
    ? incomingMessages.map(normalizeMessage).filter(Boolean)
    : [];

  if (incoming.length === 0) return base;
  if (base.length === 0) return incoming;

  let overlap = 0;
  const maxOverlap = Math.min(base.length, incoming.length);
  for (let size = maxOverlap; size > 0; size -= 1) {
    let matches = true;
    for (let i = 0; i < size; i += 1) {
      const left = base[base.length - size + i];
      const right = incoming[i];
      if (left.role !== right.role || normalize(left.content) !== normalize(right.content)) {
        matches = false;
        break;
      }
    }
    if (matches) {
      overlap = size;
      break;
    }
  }

  return base.concat(incoming.slice(overlap));
}

function extractTranscriptMessages(screenText) {
  const lines = splitLines(screenText);
  // Map from normalized user text → { userIdx, assistantIdx } in messages array
  const turnIndex = new Map();
  const messages = [];
  let i = 0;

  while (i < lines.length && !isPromptStart(lines[i])) i += 1;

  while (i < lines.length) {
    while (i < lines.length && (isHeaderNoise(lines[i]) || isFooterLine(lines[i]) || isEmptyPrompt(lines[i]))) i += 1;
    if (i >= lines.length) break;
    if (!isPromptStart(lines[i])) {
      i += 1;
      continue;
    }

    const userLines = [String(lines[i]).replace(/^>\s*/, '')];
    i += 1;
    while (i < lines.length && shouldStayInUserBlock(lines[i])) {
      userLines.push(normalize(lines[i]));
      i += 1;
    }
    const userText = userLines.join('\n').trim();

    const assistantLines = [];
    while (i < lines.length) {
      if (isPromptStart(lines[i])) break;
      if (isEmptyPrompt(lines[i])) {
        i += 1;
        break;
      }
      if (shouldKeepAssistantLine(lines[i])) assistantLines.push(lines[i]);
      i += 1;
    }
    const assistantText = assistantLines.join('\n').trim();

    const key = normalize(userText);
    if (!key) continue;

    if (turnIndex.has(key)) {
      // TUI re-render: same user prompt seen again — update the assistant content
      // with the later (more complete) render, keeping the longer of the two.
      const { assistantIdx } = turnIndex.get(key);
      if (assistantIdx >= 0 && assistantText) {
        const prev = messages[assistantIdx].content;
        if (assistantText.length > prev.length || !prev) {
          messages[assistantIdx] = { role: 'assistant', content: assistantText };
        }
      }
    } else {
      const userIdx = messages.length;
      messages.push({ role: 'user', content: userText });
      const assistantIdx = assistantText ? messages.length : -1;
      if (assistantText) messages.push({ role: 'assistant', content: assistantText });
      turnIndex.set(key, { userIdx, assistantIdx });
    }
  }

  return messages;
}

module.exports = function parseOutput(stateOrInput, maybeInput) {
  const hasState = arguments.length >= 2;
  const state = hasState ? stateOrInput : null;
  const input = hasState ? maybeInput : stateOrInput;
  const screenText = sourceText(input);
  const status = detectStatus(input);
  const activeModal = parseApproval(input);
  const transientError = detectHighTrafficError(screenText);
  const promptText = getLastUserPrompt(input);
  const previousPromptText = getLastUserPromptFromMessages(input?.messages);
  let messages = extractTranscriptMessages(screenText);

  if (activeModal) {
    messages = messages.filter((message) => message.role !== 'assistant');
  }

  if (messages.length === 0) {
    const fallback = [];
    if (normalize(promptText) && normalize(promptText) !== normalize(previousPromptText)) {
      pushDeduped(fallback, 'user', promptText);
    }
    if (!activeModal) pushDeduped(fallback, 'assistant', extractFallbackAssistantText(screenText, promptText));
    messages = fallback;
  }

  const retry = transientError && !activeModal
    ? buildHighTrafficRetry(state, promptText, screenText)
    : {};

  return {
    status: transientError && !activeModal ? 'error' : status,
    title: 'Antigravity CLI',
    messages: mergeMessages(input?.messages, messages),
    activeModal,
    ...(transientError || {}),
    ...retry,
    ...(() => {
      const native = nativeHistory.readAntigravityNativeHistory({
        historySessionId: input?.historySessionId || input?.providerSessionId || input?.sessionId,
        workspace: input?.workspace || input?.workingDir,
        promptText,
      });
      return native?.providerSessionId ? { providerSessionId: native.providerSessionId } : {};
    })(),
  };
};
