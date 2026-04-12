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
    || /reasoning/i.test(line)
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

function dedupeMessages(messages) {
  const next = [];
  for (const message of messages) {
    const prev = next[next.length - 1];
    if (prev && prev.role === message.role && prev.content === message.content) {
      continue;
    }
    next.push(message);
  }
  return next.slice(-50).map((message, index) => ({
    id: `msg_${index}`,
    role: message.role,
    content: message.content,
    index,
    kind: 'standard',
  }));
}

function parseMessages(text) {
  const lines = cleanAnsi(text).split(/\r?\n/);
  const messages = [];
  let inAssistantBox = false;
  let assistantLines = [];

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

  for (const rawLine of lines) {
    const line = normalize(rawLine);
    if (!line) continue;

    if (/^●\s+/.test(line)) {
      if (inAssistantBox) {
        flushAssistant();
        inAssistantBox = false;
      }
      const content = line.replace(/^●\s+/, '').trim();
      if (content) messages.push({ role: 'user', content });
      continue;
    }

    if (/^╭─\s*⚕\s*Hermes/i.test(line)) {
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
    }
  }

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
  });

  const messages = parseMessages(transcript || screenText);
  const activeModal = status === 'waiting_approval'
    ? parseApproval({ screenText, buffer: transcript, tail: input?.recentBuffer || input?.tail || '' })
    : null;
  const model = extractCurrentModel(screenText || transcript);
  const providerSessionId = extractProviderSessionId(transcript || screenText);
  const historyState = extractHistoryState(transcript || screenText);

  return {
    id: 'cli_session',
    title: 'Hermes Agent',
    status,
    model,
    messages,
    activeModal,
    providerSessionId,
    ...historyState,
  };
};
