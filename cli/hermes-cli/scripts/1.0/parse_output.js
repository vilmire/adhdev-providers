/**
 * Hermes CLI — parse_output (TUI parser)
 *
 * Goal: work without --quiet.
 * Strategy (inspired by Claude Code provider):
 * - Build a screen snapshot (lines with indices)
 * - Identify the last prompt line (❯) and ignore everything below it
 * - Scope to the current turn using the last user message when possible
 * - Strip known chrome/noise blocks (banner, tools/skills sidebars, status bar)
 * - Extract the last contiguous content block as assistant text
 */
'use strict';

const detectStatus = require('./detect_status.js');
const { buildFromBufferFallback, normalizeLineText, toText } = require('./screen_helpers.js');

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function looksLikeSamePrompt(a, b) {
  const left = normalizeText(a).toLowerCase();
  const right = normalizeText(b).toLowerCase();
  if (!left || !right) return false;
  if (left === right) return true;
  const min = Math.min(left.length, right.length);
  if (min < 24) return false;
  return left.startsWith(right) || right.startsWith(left) || left.includes(right) || right.includes(left);
}

function getLastUserPrompt(previousMessages) {
  return [...(Array.isArray(previousMessages) ? previousMessages : [])]
    .reverse()
    .find(m => m?.role === 'user' && typeof m.content === 'string')
    ?.content || '';
}

function isBoxLine(trimmed) {
  return /^[─═╭╮╰╯│┌┐└┘├┤┬┴┼]+$/.test(trimmed);
}

function isStatusBar(trimmed) {
  return /\bctx\b/i.test(trimmed) && /\b\d+s\b/.test(trimmed);
}

function isPromptLine(trimmed) {
  return /^❯\s*$/.test(trimmed);
}

function isBannerLine(trimmed) {
  // Big ASCII art block often contains these.
  return /██╗|╚═╝/.test(trimmed);
}

function isChromeLine(trimmed) {
  if (!trimmed) return true;
  if (isBoxLine(trimmed)) return true;
  if (isStatusBar(trimmed)) return true;
  if (isPromptLine(trimmed)) return true;
  if (isBannerLine(trimmed)) return true;
  if (/^Hermes Agent\b/i.test(trimmed)) return true;
  if (/^Welcome to Hermes Agent!/i.test(trimmed)) return true;
  if (/^Available Tools\b/i.test(trimmed)) return true;
  if (/^Available Skills\b/i.test(trimmed)) return true;
  if (/^Session:\s*\d{8}_\d{6}_/i.test(trimmed)) return true;
  if (/^\/?help for commands\b/i.test(trimmed)) return true;
  if (/^✦ Tip:/i.test(trimmed)) return true;
  if (/^Goodbye!/.test(trimmed)) return true;
  if (/^usage: hermes\b/i.test(trimmed)) return true;
  // Setup warnings / misc
  if (/tirith security scanner enabled but not available/i.test(trimmed)) return true;
  return false;
}

function stripCompressionWarningBlock(lines) {
  // Drop from "⚠ Compression model" until a blank line.
  const out = [];
  let dropping = false;
  for (const l of lines) {
    const t = l.trim();
    if (!dropping && /^⚠\s+Compression model\b/i.test(t)) {
      dropping = true;
      continue;
    }
    if (dropping) {
      if (t === '') dropping = false;
      continue;
    }
    out.push(l);
  }
  return out;
}

function scopeToCurrentTurn(lines, promptText) {
  const prompt = normalizeText(promptText);
  if (!prompt) return lines;

  // Find a line that approximately matches the prompt text, then only keep lines after it.
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const t = normalizeLineText(lines[i]);
    if (!t) continue;
    if (looksLikeSamePrompt(t, prompt)) {
      return lines.slice(i + 1);
    }
  }
  return lines;
}

function extractAssistantBlock(lines) {
  // Remove chrome lines but keep content.
  const cleaned = [];
  for (const line of lines) {
    const trimmed = normalizeLineText(line);
    if (!trimmed) {
      cleaned.push('');
      continue;
    }
    if (isChromeLine(trimmed)) continue;
    cleaned.push(String(line?.text ?? line));
  }

  // Normalize and remove compression warning block (can appear even in non-quiet output)
  let normalized = cleaned
    .join('\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  let normLines = normalized.split('\n').map(l => l.replace(/\s+$/g, ''));
  normLines = stripCompressionWarningBlock(normLines);

  // Drop leading/trailing empties
  while (normLines.length && !normLines[0].trim()) normLines.shift();
  while (normLines.length && !normLines[normLines.length - 1].trim()) normLines.pop();
  if (normLines.length === 0) return '';

  // Choose the last non-empty block separated by blank lines.
  const blocks = [];
  let cur = [];
  for (const l of normLines) {
    if (!l.trim()) {
      if (cur.length) { blocks.push(cur.join('\n').trim()); cur = []; }
      continue;
    }
    cur.push(l);
  }
  if (cur.length) blocks.push(cur.join('\n').trim());

  const lastBlock = blocks.filter(Boolean).at(-1) || '';

  // If the last block is still massive chrome, return empty.
  if (!lastBlock) return '';
  if (/^Available Tools\b/i.test(lastBlock)) return '';
  return lastBlock;
}

function toMessageObjects(messages, status) {
  const base = Array.isArray(messages) ? messages : [];
  return base.slice(-50).map((m, i, arr) => ({
    id: `msg_${i}`,
    role: m.role,
    content: m.content,
    index: i,
    kind: 'standard',
    ...(status === 'generating' && i === arr.length - 1 && m.role === 'assistant'
      ? { meta: { streaming: true } }
      : {})
  }));
}

module.exports = function parseOutput(input) {
  const previousMessages = Array.isArray(input?.messages) ? input.messages : [];

  // Prefer real screen snapshot; fall back to buffer.
  const screen = buildFromBufferFallback(input);

  // Ignore everything below the last prompt (input area)
  const abovePrompt = Array.isArray(screen.linesAbovePrompt)
    ? screen.linesAbovePrompt
    : (screen.promptLineIndex >= 0 ? screen.lines.slice(0, screen.promptLineIndex) : screen.lines);

  const tailText = toText(abovePrompt, { trim: false }).slice(-2000);
  const status = detectStatus({ ...input, tail: tailText, screenText: toText(screen.lines, { trim: false }) });

  const lastUserPrompt = getLastUserPrompt(previousMessages);
  const scopedLines = scopeToCurrentTurn(abovePrompt, lastUserPrompt);
  const assistantText = extractAssistantBlock(scopedLines);

  const msgs = previousMessages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant'))
    .map(m => ({ role: m.role, content: String(m.content || '') }));

  if (assistantText) {
    const last = msgs[msgs.length - 1];
    if (!last || last.role !== 'assistant') msgs.push({ role: 'assistant', content: assistantText });
    else if (assistantText.length > last.content.length && normalizeText(last.content) !== normalizeText(assistantText)) {
      last.content = assistantText;
    }
  }

  // Try to extract currently shown model from the header line:
  // "⚕ gemini-3-flash-preview · Nous Research"
  let controlValues;
  const headerMatch = /⚕\s+([^·\n]+)\s+·/m.exec(toText(abovePrompt, { trim: false }));
  if (headerMatch && headerMatch[1]) {
    controlValues = { model: headerMatch[1].trim() };
  }

  return {
    id: 'cli_session',
    status,
    title: 'Hermes Agent',
    messages: toMessageObjects(msgs, status),
    ...(controlValues ? { controlValues } : {})
  };
};
