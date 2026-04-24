'use strict';

const parseApproval = require('./parse_approval.js');
const { cleanAnsi } = require('./helpers.js');
const { getScreen, getBufferScreen, getTailScreen } = require('./screen_helpers.js');

function compactStatusText(text) {
  const source = cleanAnsi(text || '');
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return lines.slice(-20).join('\n');
}

function isPromptAdjacentStatusLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return false;
  if (!/(?:\.\.\.|…)/.test(trimmed)) return false;
  if (/^(?:❯|⚕\s*❯|●|╭─|╰─|[┊│])/.test(trimmed)) return false;
  if (/Type your message|Resume this session with:|Session:/i.test(trimmed)) return false;
  if (!/ing(?:\.\.\.|…)/i.test(trimmed)) return false;
  if (trimmed.length <= 64 && /(?:\.\.\.|…)\s*$/.test(trimmed)) return true;
  return /(?:\.\.\.|…)\s+.*(?:\b\d+(?:\.\d+)?[sm]\b|[↑↓]|tokens?|recall:|gpt-[\w.-]+|\[[^\]]+\]|%)/i.test(trimmed);
}

function hasPromptAdjacentEllipsisStatus(screen) {
  const linesAbovePrompt = Array.isArray(screen?.linesAbovePrompt) ? screen.linesAbovePrompt : [];
  return linesAbovePrompt
    .map((line) => String(line?.trimmed || line?.text || line || '').trim())
    .filter(Boolean)
    .slice(-5)
    .some(isPromptAdjacentStatusLine);
}

function hasStrictBarePromptOnly(text) {
  const lines = String(text || '')
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return false;
  return lines.every((line) => /^❯\s*$/.test(line) || /^[─═╭╮╰╯│┌┐└┘├┤┬┴┼]+$/.test(line));
}

function buildStatusSignals(screen) {
  const text = compactStatusText(screen?.text || '');
  const lines = text.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const lastMatchingIndex = (predicate) => {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (predicate(lines[index])) return index;
    }
    return -1;
  };

  const hasEllipsisStatusAbovePrompt = hasPromptAdjacentEllipsisStatus(screen);
  const hasBarePrompt = /^❯\s*$/m.test(text);
  const hasPrompt = /Type your message or \/help for commands/i.test(text)
    || /Resume this session with:/i.test(text);
  const hasInitializing = /Initializing agent/i.test(text);
  const hasInterruptFooter = /Enter to interrupt, Ctrl\+C to cancel/i.test(text);
  const hasLiveUserTurn = /(?:^|\n)●\s+/.test(text);
  const hasLiveToolActivity = /(?:^|\n)[┊│]\s*(?:\p{Emoji}\uFE0F?|\$)/u.test(text);
  const hasLiveTurnMarkers = hasLiveUserTurn || hasLiveToolActivity;
  const lastPromptIndex = lastMatchingIndex((line) => /^❯\s*$/.test(line));
  const lastAssistantStartIndex = lastMatchingIndex((line) => /^╭─\s*⚕\s*Hermes/i.test(line));
  const lastAssistantEndIndex = lastMatchingIndex((line) => /^╰─/.test(line));
  const lastGeneratingIndex = lastMatchingIndex((line) => /Initializing agent|Enter to interrupt, Ctrl\+C to cancel/i.test(line));
  const finishedAssistantVisible = lastAssistantEndIndex >= 0
    && lastPromptIndex > lastAssistantEndIndex
    && (lastGeneratingIndex < 0 || lastGeneratingIndex <= lastAssistantEndIndex);
  const hasOpenAssistantBox = lastAssistantStartIndex >= 0
    && lastAssistantStartIndex > lastAssistantEndIndex;

  return {
    text,
    hasBarePrompt,
    hasPrompt,
    hasInitializing,
    hasInterruptFooter,
    hasLiveTurnMarkers,
    hasEllipsisStatusAbovePrompt,
    finishedAssistantVisible,
    hasOpenAssistantBox,
  };
}

module.exports = function detectStatus(input) {
  const currentScreen = getScreen(input);
  const bufferScreen = getBufferScreen(input);
  const tailScreen = getTailScreen(input);
  const current = buildStatusSignals(currentScreen);
  if (!current.text.trim()) return 'idle';

  const approvalModal = parseApproval({
    screenText: currentScreen?.text || input?.screenText || '',
    buffer: bufferScreen?.text || input?.buffer || '',
    tail: tailScreen?.text || input?.tail || input?.recentBuffer || '',
    screen: currentScreen,
    bufferScreen,
    tailScreen,
  });
  if (approvalModal) {
    return 'waiting_approval';
  }

  if (current.finishedAssistantVisible) {
    return 'idle';
  }

  const recentRawSignals = [tailScreen, bufferScreen]
    .map(buildStatusSignals)
    .some((signals) => signals.hasInitializing
      || signals.hasInterruptFooter
      || signals.hasLiveTurnMarkers
      || signals.hasEllipsisStatusAbovePrompt
      || signals.hasOpenAssistantBox);

  if (current.hasOpenAssistantBox) {
    return 'generating';
  }

  if (current.hasEllipsisStatusAbovePrompt) {
    return 'generating';
  }

  if ((current.hasBarePrompt || current.hasPrompt)
      && !current.hasInitializing
      && !current.hasInterruptFooter
      && !current.hasLiveTurnMarkers
      && !current.hasEllipsisStatusAbovePrompt) {
    if (recentRawSignals) {
      return 'generating';
    }
    return 'idle';
  }

  if (current.hasInitializing || current.hasInterruptFooter || current.hasLiveTurnMarkers || current.hasEllipsisStatusAbovePrompt) {
    return 'generating';
  }

  return 'generating';
};
