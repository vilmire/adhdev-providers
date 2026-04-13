'use strict';

function sourceText(input) {
  return String(input?.screenText || input?.tail || input?.buffer || '');
}

module.exports = function detectStatus(input) {
  const text = sourceText(input);
  if (!text.trim()) return 'idle';

  const hasDangerousPrompt = /Dangerous Command/i.test(text)
    && /Allow once|Allow for this session|Add to permanent allowlist|Deny/i.test(text);
  if (hasDangerousPrompt) {
    return 'waiting_approval';
  }

  const hasPrompt = /Type your message or \/help for commands/i.test(text)
    || /Resume this session with:/i.test(text);
  const isGenerating = /Initializing agent/i.test(text)
    || /reasoning/i.test(text)
    || /Enter to interrupt, Ctrl\+C to cancel/i.test(text);

  if (isGenerating) return 'generating';

  const hasBarePrompt = /^❯\s*$/m.test(text);
  if (hasBarePrompt) return 'idle';

  if (hasPrompt) return 'idle';

  return 'idle';
};
