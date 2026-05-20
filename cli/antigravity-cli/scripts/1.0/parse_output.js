'use strict';

const detectStatus = require('./detect_status.js');
const parseApproval = require('./parse_approval.js');

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
    || /^\?\s+for\s+shortcuts$/i.test(text)
    || /^thinking for\b/i.test(text)
    || /^esc to cancel$/i.test(text)
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
    || /antigravity cli 1\.0\.0/i.test(text)
    || /google ai ultra/i.test(text)
    || /gemini 3\.5 flash \(high\)/i.test(text)
    || /^signed in as:/i.test(text)
    || /^welcome to the antigravity cli/i.test(text);
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
  return !!text && !isFooterLine(line);
}

function pushDeduped(messages, role, content) {
  const text = String(content || '').trim();
  if (!text) return;
  const last = messages[messages.length - 1];
  if (last?.role === role && normalize(last.content) === normalize(text)) return;
  messages.push({ role, content: text });
}

function extractTranscriptMessages(screenText) {
  const lines = splitLines(screenText);
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
    pushDeduped(messages, 'user', userLines.join('\n'));

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
    const visibleTurnText = assistantText
      ? `${userLines.join('\n')}\n${assistantText}`
      : '';
    pushDeduped(messages, 'assistant', visibleTurnText);
  }

  return messages;
}

module.exports = function parseOutput(input) {
  const screenText = sourceText(input);
  const status = detectStatus(input);
  const activeModal = parseApproval(input);
  const promptText = getLastUserPrompt(input);
  let messages = extractTranscriptMessages(screenText);

  if (activeModal) {
    messages = messages.filter((message) => message.role !== 'assistant');
  }

  if (messages.length === 0) {
    const fallback = [];
    pushDeduped(fallback, 'user', promptText);
    if (!activeModal) {
      const text = splitLines(screenText).filter((line) => !isFooterLine(line) && !isHeaderNoise(line)).join('\n').trim();
      pushDeduped(fallback, 'assistant', text);
    }
    messages = fallback;
  }

  return {
    status,
    title: 'Antigravity CLI',
    messages,
    activeModal,
  };
};