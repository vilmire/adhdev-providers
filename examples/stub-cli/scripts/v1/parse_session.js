'use strict';

/**
 * stub-cli parse_session.js — minimal deterministic parseSession for the
 * worked example. Contract: docs/provider-contract/cli/v1.md §5.1.
 *
 * Deterministic by construction: pure function of the input buffer, no
 * timestamps, no randomness, no I/O. The same PTY transcript always yields
 * the same ParsedSession, which is what makes fixtures/cold-start.* a stable
 * regression test.
 *
 * Zero dependencies on purpose: provider scripts are loaded inside a gated
 * require root, so an example must be self-contained to survive being copied
 * out of this repository.
 */

var SPINNER_RE = /(?:⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏)\s+Thinking|^\s*\.\.\.\s+working/im;
var SETTLED_PROMPT_RE = /^stub>\s*$/;
var PROMPT_LINE_RE = /^stub>\s?(.*)$/;
var SEPARATOR_RE = /^\s*─{3,}\s*$/;
var MODAL_QUESTION_RE = /Approve\s+this\s+action\?/i;
var MODAL_BUTTON_RE = /^\s*(\d+)\.\s+(.+)$/;

function linesOf(text) {
  return String(text || '').replace(/\r/g, '').split('\n');
}

function isSpinnerLine(line) {
  return SPINNER_RE.test(line);
}

function isSeparatorLine(line) {
  return SEPARATOR_RE.test(line);
}

/**
 * Extract the approval modal. Mirrors the daemon's declarative tui.modal
 * semantics (scope "between-last-two-separators"): locate the question line
 * first; when the last two separator rules actually BRACKET the question, the
 * frame between them is the scope; otherwise fall back to a window around the
 * question. This keeps numbered lists inside assistant prose from ever being
 * mistaken for a modal while still detecting a modal whose closing separator
 * has not rendered yet.
 */
function extractModal(lines) {
  var questionIndex = -1;
  var message = '';
  for (var i = lines.length - 1; i >= 0; i--) {
    if (MODAL_QUESTION_RE.test(lines[i]) && !MODAL_BUTTON_RE.test(lines[i])) {
      questionIndex = i;
      message = lines[i].trim();
      break;
    }
  }
  if (questionIndex === -1) return null;

  var lastSep = -1;
  var prevSep = -1;
  for (var j = lines.length - 1; j >= 0; j--) {
    if (isSeparatorLine(lines[j])) {
      if (lastSep === -1) lastSep = j;
      else { prevSep = j; break; }
    }
  }
  var start;
  var end;
  if (lastSep >= 0 && prevSep >= 0 && questionIndex >= prevSep && questionIndex <= lastSep) {
    start = prevSep;
    end = lastSep;
  } else {
    start = Math.max(0, questionIndex - 4);
    end = Math.min(lines.length - 1, questionIndex + 16);
  }

  var buttons = [];
  for (var k = questionIndex + 1; k <= end; k++) {
    var match = MODAL_BUTTON_RE.exec(lines[k]);
    if (match) buttons.push(match[2].trim());
  }
  if (buttons.length < 2) return null;
  return { message: message, buttons: buttons };
}

function detectStubStatus(lines, modal) {
  if (modal) return 'waiting_approval';
  var tail = lines.slice(-8);
  for (var i = tail.length - 1; i >= 0; i--) {
    if (isSpinnerLine(tail[i])) return 'generating';
  }
  for (var j = lines.length - 1; j >= 0; j--) {
    var line = lines[j];
    if (!line.trim()) continue;
    if (SETTLED_PROMPT_RE.test(line)) return 'idle';
    break;
  }
  return 'starting';
}

/**
 * Build the visible transcript: `stub> <text>` echoes become user messages;
 * consecutive remaining prose lines merge into assistant messages. Prompt
 * shells, spinner frames, separator rules, and the modal block are excluded.
 */
function extractMessages(lines, modal) {
  var messages = [];
  var assistantBuf = [];

  function flushAssistant() {
    if (!assistantBuf.length) return;
    messages.push({ role: 'assistant', kind: 'standard', content: assistantBuf.join('\n') });
    assistantBuf = [];
  }

  var inModal = false;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (isSeparatorLine(line)) {
      flushAssistant();
      inModal = false;
      continue;
    }
    if (modal && (MODAL_QUESTION_RE.test(line) || (inModal && MODAL_BUTTON_RE.test(line)))) {
      inModal = true;
      continue;
    }
    if (inModal && !line.trim()) continue;
    inModal = false;
    if (isSpinnerLine(line)) {
      flushAssistant();
      continue;
    }
    var promptMatch = PROMPT_LINE_RE.exec(line);
    if (promptMatch) {
      flushAssistant();
      var echoed = promptMatch[1].trim();
      if (echoed) {
        messages.push({ role: 'user', kind: 'standard', content: echoed });
      }
      continue;
    }
    if (!line.trim()) {
      flushAssistant();
      continue;
    }
    assistantBuf.push(line.trim());
  }
  flushAssistant();
  return messages;
}

/**
 * parseSession(state, input) → ParsedSession
 * Tolerates being invoked as parseSession(input) too (runner picks arity by
 * fn.length; both shapes occur in the wild).
 */
function parseSession(state, input) {
  var cliInput = input || state || {};
  var buffer = typeof cliInput.buffer === 'string' && cliInput.buffer
    ? cliInput.buffer
    : (typeof cliInput.screenText === 'string' ? cliInput.screenText : '');
  var lines = linesOf(buffer);
  var modal = extractModal(lines);
  var status = detectStubStatus(lines, modal);
  return {
    status: status,
    messages: extractMessages(lines, modal),
    modal: modal,
    parsedStatus: status,
  };
}

module.exports = parseSession;
