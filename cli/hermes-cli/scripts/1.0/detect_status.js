'use strict';

const { cleanAnsi } = require('./helpers.js');

function sourceText(input) {
  const source = cleanAnsi(input?.screenText || input?.tail || input?.buffer || '');
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return lines.slice(-20).join('\n');
}

module.exports = function detectStatus(input) {
  const text = sourceText(input);
  if (!text.trim()) return 'idle';

  const hasDangerousPrompt = /Dangerous Command/i.test(text)
    && /Allow once|Allow for this session|Add to permanent allowlist|Deny/i.test(text);
  if (hasDangerousPrompt) {
    return 'waiting_approval';
  }

  const lines = text.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const lastMatchingIndex = (predicate) => {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (predicate(lines[index])) return index;
    }
    return -1;
  };

  const hasBarePrompt = /^❯\s*$/m.test(text);
  const hasPrompt = /Type your message or \/help for commands/i.test(text)
    || /Resume this session with:/i.test(text);
  const hasThinkingIndicator = /(?:^|\n)\s*(?:\([^\n]{0,24}\)\s*)?(?:♡\s*)?reasoning(?:\.\.\.|…)/im.test(text);
  const hasInitializing = /Initializing agent/i.test(text);
  const hasInterruptFooter = /Enter to interrupt, Ctrl\+C to cancel/i.test(text);

  const lastPromptIndex = lastMatchingIndex((line) => /^❯\s*$/.test(line));
  const lastAssistantEndIndex = lastMatchingIndex((line) => /^╰─/.test(line));
  const lastGeneratingIndex = lastMatchingIndex((line) => /Initializing agent|reasoning(?:\.\.\.|…)|Enter to interrupt, Ctrl\+C to cancel/i.test(line));
  const finishedAssistantVisible = lastAssistantEndIndex >= 0
    && lastPromptIndex > lastAssistantEndIndex
    && (lastGeneratingIndex < 0 || lastGeneratingIndex <= lastAssistantEndIndex);

  if (finishedAssistantVisible) {
    return 'idle';
  }

  // Only call idle when we see a prompt indicator AND no active generation footer.
  // If hasInterruptFooter is also present (e.g. startup text still in 20-line window
  // while a new generation is underway), fall through rather than false-complete.
  if ((hasBarePrompt || hasPrompt) && !hasThinkingIndicator && !hasInitializing && !hasInterruptFooter) {
    return 'idle';
  }

  if (hasInitializing || hasThinkingIndicator || hasInterruptFooter) {
    return 'generating';
  }

  // No clear idle indicator found — default to generating so tool execution with
  // large output (interrupt footer scrolled past the 20-line window) doesn't
  // trigger a false completion notification.
  return 'generating';
};
